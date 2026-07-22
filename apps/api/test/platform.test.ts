import 'reflect-metadata';
import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  UnauthorizedException,
  type CallHandler,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { createHash } from 'node:crypto';
import { lastValueFrom, of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { createLogger } from '@zhili/observability';
import {
  AuthenticatedPrincipalGuard,
  PERMISSIONS_METADATA_KEY,
  PermissionGuard,
  createAuthenticatedPrincipal,
} from '@zhili/auth';
import { parseStrongEtag, PreconditionRequiredException } from '../src/platform/etag';
import {
  IdempotencyInterceptor,
  canonicalBodyHash,
  validateIdempotencyKey,
} from '../src/platform/idempotency';
import { ProblemFilter } from '../src/platform/problem-filter';
import { RequestContextInterceptor, buildRequestContext } from '../src/platform/request-context';

const tenantId = '01J0000000000000000000000A';
const subjectId = '01J0000000000000000000001A';

class TestReply {
  body: unknown;
  statusCode = 200;
  readonly headers: Record<string, string | readonly string[]> = {};

  status(statusCode: number): this {
    this.statusCode = statusCode;
    return this;
  }

  header(name: string, value: string | readonly string[]): this {
    this.headers[name.toLowerCase()] = value;
    return this;
  }

  getHeaders(): Record<string, string | readonly string[]> {
    return { ...this.headers };
  }

  removeHeader(name: string): this {
    delete this.headers[name.toLowerCase()];
    return this;
  }

  send(body: unknown): this {
    this.body = body;
    return this;
  }
}

function httpContext(
  request: Record<string, unknown>,
  reply = new TestReply(),
  handler: (...args: never[]) => unknown = () => undefined
): ExecutionContext {
  class TestController {}

  return {
    getArgs: () => [request, reply],
    getArgByIndex: (index: number) => [request, reply][index],
    switchToRpc: () => {
      throw new Error('RPC context is unavailable in this HTTP test');
    },
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => reply,
      getNext: () => undefined,
    }),
    switchToWs: () => {
      throw new Error('WebSocket context is unavailable in this HTTP test');
    },
    getClass: () => TestController,
    getHandler: () => handler,
    getType: () => 'http',
  } as unknown as ExecutionContext;
}

describe('strong ETag parsing', () => {
  it.each([undefined, '', '1', 'W/"1"', '"0"', '"01"', '"-1"', '"9007199254740992"'])(
    'rejects a missing or non-strong positive integer ETag: %s',
    (value) => {
      expect(() => parseStrongEtag(value)).toThrow(PreconditionRequiredException);
    }
  );

  it('returns the positive version from a strong ETag', () => {
    expect(parseStrongEtag('"42"')).toBe(42);
    expect(parseStrongEtag('"9007199254740991"')).toBe(Number.MAX_SAFE_INTEGER);
  });
});

describe('idempotency input', () => {
  it.each([undefined, '', 'short', 'a'.repeat(129)])(
    'rejects a missing or out-of-contract idempotency key',
    (value) => {
      expect(() => validateIdempotencyKey(value)).toThrow(BadRequestException);
    }
  );

  it('accepts the OpenAPI key bounds', () => {
    expect(validateIdempotencyKey('a'.repeat(16))).toBe('a'.repeat(16));
    expect(validateIdempotencyKey('z'.repeat(128))).toBe('z'.repeat(128));
  });

  it('uses canonical JSON and SHA-256 for body hashes', () => {
    const expected = createHash('sha256').update('{"a":1,"nested":{"x":2,"y":3}}').digest('hex');

    expect(canonicalBodyHash({ nested: { y: 3, x: 2 }, a: 1 })).toBe(expected);
    expect(canonicalBodyHash({ a: 1, nested: { x: 2, y: 3 } })).toBe(expected);
    expect(canonicalBodyHash({ a: 2, nested: { x: 2, y: 3 } })).not.toBe(expected);
  });
});

describe('authenticated request context', () => {
  it('uses only a trusted principal and propagates x-request-id', () => {
    const principal = createAuthenticatedPrincipal({
      tenantId,
      subjectId,
      permissions: ['waybill:write'],
    });
    const context = buildRequestContext({
      headers: { 'x-request-id': 'request-from-edge' },
      principal,
      body: {
        tenantId: '01J0000000000000000000000B',
        subjectId: '01J0000000000000000000001B',
      },
      query: { tenantId: '01J0000000000000000000000C' },
    });

    expect(context).toEqual({
      tenantId,
      subjectId,
      permissions: ['waybill:write'],
      requestId: 'request-from-edge',
    });
  });

  it('rejects an untrusted principal-shaped request value', () => {
    expect(() =>
      buildRequestContext({
        headers: {},
        principal: { tenantId, subjectId, permissions: ['waybill:write'] },
      })
    ).toThrow(UnauthorizedException);
  });

  it('is directly registerable as a Nest interceptor', async () => {
    const principal = createAuthenticatedPrincipal({ tenantId, subjectId, permissions: [] });
    const request: Record<string, unknown> = {
      headers: { 'x-request-id': 'request-interceptor' },
      principal,
    };
    const reply = new TestReply();
    const next: CallHandler = { handle: () => of({ ok: true }) };

    const result = await lastValueFrom(
      new RequestContextInterceptor().intercept(httpContext(request, reply), next)
    );

    expect(result).toEqual({ ok: true });
    expect(request.requestContext).toEqual({
      tenantId,
      subjectId,
      permissions: [],
      requestId: 'request-interceptor',
    });
    expect(reply.headers['x-request-id']).toBe('request-interceptor');
  });

  it('bypasses context creation for a route explicitly marked public', async () => {
    const handler = () => undefined;
    Reflect.defineMetadata('zhili:public-route', true, handler);
    const request: Record<string, unknown> = {
      headers: { 'x-request-id': 'request-public' },
    };
    const reply = new TestReply();

    const result = await lastValueFrom(
      new RequestContextInterceptor().intercept(httpContext(request, reply, handler), {
        handle: () => of({ live: true }),
      })
    );

    expect(result).toEqual({ live: true });
    expect(request.requestContext).toBeUndefined();
    expect(reply.headers['x-request-id']).toBe('request-public');
  });
});

describe('authentication and permission guards', () => {
  it('rejects requests without a trusted authenticated principal', () => {
    const guard = new AuthenticatedPrincipalGuard();

    expect(() => guard.canActivate(httpContext({ principal: { tenantId, subjectId } }))).toThrow(
      UnauthorizedException
    );
  });

  it('requires every permission declared on the route', () => {
    const handler = () => undefined;
    Reflect.defineMetadata(PERMISSIONS_METADATA_KEY, ['waybill:read', 'waybill:write'], handler);
    const principal = createAuthenticatedPrincipal({
      tenantId,
      subjectId,
      permissions: ['waybill:read'],
    });
    const guard = new PermissionGuard(new Reflector());

    expect(() => guard.canActivate(httpContext({ principal }, new TestReply(), handler))).toThrow(
      ForbiddenException
    );
  });

  it('allows public routes through authentication and permission guards', () => {
    const handler = () => undefined;
    Reflect.defineMetadata('zhili:public-route', true, handler);
    const context = httpContext({ headers: {} }, new TestReply(), handler);

    expect(new AuthenticatedPrincipalGuard().canActivate(context)).toBe(true);
    expect(new PermissionGuard(new Reflector()).canActivate(context)).toBe(true);
  });
});

describe('idempotency route metadata', () => {
  it('bypasses requests that are not declared idempotent commands', async () => {
    const request: Record<string, unknown> = { headers: {}, body: { read: true } };

    const result = await lastValueFrom(
      new IdempotencyInterceptor().intercept(httpContext(request), {
        handle: () => of({ data: 'read-result' }),
      })
    );

    expect(result).toEqual({ data: 'read-result' });
  });
});

describe('Problem Details filter', () => {
  it.each([
    [400, 'BAD_REQUEST'],
    [401, 'UNAUTHORIZED'],
    [403, 'FORBIDDEN'],
    [404, 'NOT_FOUND'],
    [409, 'CONFLICT'],
    [412, 'PRECONDITION_FAILED'],
    [413, 'PAYLOAD_TOO_LARGE'],
    [422, 'UNPROCESSABLE_ENTITY'],
    [429, 'RATE_LIMITED'],
    [500, 'INTERNAL_ERROR'],
  ])('maps HTTP %i to a stable problem code and request ID', (status, code) => {
    const reply = new TestReply();
    const filter = new ProblemFilter({ error: vi.fn() });
    const request = {
      headers: {},
      requestContext: { tenantId, subjectId, permissions: [], requestId: 'request-problem' },
    };

    filter.catch(new HttpException(`detail-${status}`, status), {
      switchToHttp: () => ({ getRequest: () => request, getResponse: () => reply }),
    } as never);

    expect(reply.statusCode).toBe(status);
    expect(reply.headers['content-type']).toBe('application/problem+json');
    expect(reply.body).toEqual({
      code,
      detail: status === 500 ? 'The service could not complete the request.' : `detail-${status}`,
      remediation: expect.any(String),
      requestId: 'request-problem',
    });
  });

  it('logs an unknown exception only through the redacted logger and returns no exception detail', () => {
    const reply = new TestReply();
    const error = vi.fn();
    const filter = new ProblemFilter({ error });
    const request = {
      headers: { 'x-request-id': 'request-unknown' },
      body: { password: 'do-not-return' },
    };

    filter.catch(new Error('password=do-not-return'), {
      switchToHttp: () => ({ getRequest: () => request, getResponse: () => reply }),
    } as never);

    expect(reply.body).toEqual({
      code: 'INTERNAL_ERROR',
      detail: 'The service could not complete the request.',
      remediation: expect.any(String),
      requestId: 'request-unknown',
    });
    expect(JSON.stringify(reply.body)).not.toContain('do-not-return');
    expect(error).toHaveBeenCalledOnce();
  });

  it('never emits enumerable nested secrets from an unknown Error through the real logger', () => {
    let logOutput = '';
    const logger = createLogger(
      { base: undefined },
      {
        write(message: string) {
          logOutput += message;
        },
      }
    );
    const exception = Object.assign(new Error('token=message-secret'), {
      config: { authorization: 'Bearer nested-secret' },
      password: 'field-secret',
    });
    exception.name = 'name-secret';
    const reply = new TestReply();

    new ProblemFilter(logger).catch(exception, {
      switchToHttp: () => ({
        getRequest: () => ({ headers: { 'x-request-id': 'request-redaction' } }),
        getResponse: () => reply,
      }),
    } as never);

    expect(logOutput).toContain('request-redaction');
    expect(logOutput).not.toContain('message-secret');
    expect(logOutput).not.toContain('nested-secret');
    expect(logOutput).not.toContain('field-secret');
    expect(logOutput).not.toContain('name-secret');
  });
});
