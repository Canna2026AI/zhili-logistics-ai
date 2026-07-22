import {
  BadRequestException,
  ConflictException,
  HttpException,
  SetMetadata,
  UnauthorizedException,
  type CallHandler,
  type CustomDecorator,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { createHash, randomBytes } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { defer, lastValueFrom, type Observable } from 'rxjs';
import { isAuthenticatedPrincipal } from '@zhili/auth';
import {
  idempotencyRecords,
  withTenantSavepoint,
  withTenantTransaction,
  type DbTransaction,
  type TenantContext,
  type TenantWork,
} from '@zhili/db';
import { mapExceptionToProblem } from './problem-filter';
import { buildRequestContext, type PrincipalRequest, type RequestContext } from './request-context';

const IDEMPOTENCY_KEY_HEADER = 'idempotency-key';
const MIN_KEY_LENGTH = 16;
const MAX_KEY_LENGTH = 128;
const RETENTION_MILLISECONDS = 24 * 60 * 60 * 1000;
const CROCKFORD_BASE32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const REPLAYABLE_RESPONSE_HEADERS = new Set([
  'cache-control',
  'content-language',
  'content-type',
  'etag',
  'location',
  'retry-after',
  'x-request-id',
]);
const DETERMINISTIC_HTTP_STATUSES = new Set([400, 403, 404, 409, 412, 413, 422]);
const DEFAULT_IDEMPOTENT_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export const IDEMPOTENT_COMMAND_METADATA_KEY = 'zhili:idempotent-command';

export function IdempotentCommand(): CustomDecorator<string> {
  return SetMetadata(IDEMPOTENT_COMMAND_METADATA_KEY, true);
}

export type TenantTransactionRunner = <T>(
  context: TenantContext,
  work: TenantWork<T>
) => Promise<T>;

interface StoredResponse {
  readonly body: unknown;
  readonly headers: Readonly<Record<string, string | readonly string[]>>;
  readonly status: number;
}

interface StoredBodyEnvelope {
  readonly __zhiliIdempotencyBody: 1;
  readonly present: boolean;
  readonly value?: unknown;
}

export function canonicalBodyHash(body: unknown): string {
  const serialized = JSON.stringify(canonicalize(body)) ?? '';
  return createHash('sha256').update(serialized).digest('hex');
}

export function validateIdempotencyKey(value: unknown): string {
  const length = typeof value === 'string' ? Array.from(value).length : 0;
  if (typeof value !== 'string' || length < MIN_KEY_LENGTH || length > MAX_KEY_LENGTH) {
    throw new BadRequestException({
      code: 'INVALID_IDEMPOTENCY_KEY',
      detail: 'Idempotency-Key must contain between 16 and 128 characters.',
      remediation: 'Provide a stable command key that satisfies the documented length.',
    });
  }
  return value;
}

export class IdempotencyInterceptor implements NestInterceptor {
  constructor(
    private readonly runInTenantTransaction: TenantTransactionRunner = withTenantTransaction,
    private readonly reflector: Reflector = new Reflector()
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const isIdempotentCommand =
      this.reflector.getAllAndOverride<boolean>(IDEMPOTENT_COMMAND_METADATA_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? false;
    const method = request.method?.toUpperCase() ?? '';
    if (!isIdempotentCommand && !DEFAULT_IDEMPOTENT_METHODS.has(method)) return next.handle();
    return defer(() => this.handle(context, next));
  }

  private async handle(context: ExecutionContext, next: CallHandler): Promise<unknown> {
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const reply = context.switchToHttp().getResponse<FastifyReply>();
    const requestContext = trustedRequestContext(request);
    request.requestContext = requestContext;
    reply.header('x-request-id', requestContext.requestId);

    const key = validateIdempotencyKey(request.headers[IDEMPOTENCY_KEY_HEADER]);
    const requestHash = requestFingerprintHash(request, requestContext.subjectId);

    return this.runInTenantTransaction(requestContext, async (tx) => {
      await lockCommand(tx, requestContext.tenantId, key);
      const now = new Date();
      const existing = await findRecord(tx, requestContext.tenantId, key);

      if (existing && existing.expiresAt > now) {
        if (existing.requestHash !== requestHash) {
          throw new ConflictException({
            code: 'IDEMPOTENCY_KEY_REUSED',
            detail: 'Idempotency-Key was already used with a different request body.',
            remediation: 'Reuse the key only for the identical command, or submit a new key.',
          });
        }
        if (existing.responseStatus === null) {
          throw new ConflictException({
            code: 'IDEMPOTENCY_RESPONSE_UNAVAILABLE',
            detail: 'The stored idempotency response is incomplete.',
            remediation: 'Retry later with the same request intent.',
          });
        }

        const snapshot: StoredResponse = {
          body: decodeStoredBody(existing.responseBody),
          headers: existing.responseHeaders ?? {},
          status: existing.responseStatus,
        };
        applySnapshot(reply, snapshot);
        return snapshot.body;
      }

      if (existing) {
        await tx.delete(idempotencyRecords).where(eq(idempotencyRecords.id, existing.id));
      }

      try {
        const responseBody = await withTenantSavepoint(async () => lastValueFrom(next.handle()));
        const snapshot = captureResponse(reply, responseBody);
        await persistSnapshot(tx, requestContext, key, requestHash, snapshot, now);
        return responseBody;
      } catch (error) {
        if (!isDeterministicHttpException(error)) throw error;

        const problem = mapExceptionToProblem(error, requestContext.requestId);
        reply
          .status(problem.status)
          .header('content-type', 'application/problem+json')
          .header('x-request-id', requestContext.requestId);
        const snapshot = captureResponse(reply, problem.body);
        await persistSnapshot(tx, requestContext, key, requestHash, snapshot, now);
        return problem.body;
      }
    });
  }
}

async function persistSnapshot(
  tx: DbTransaction,
  context: RequestContext,
  key: string,
  requestHash: string,
  snapshot: StoredResponse,
  now: Date
): Promise<void> {
  await tx.insert(idempotencyRecords).values({
    id: newUlid(),
    tenantId: context.tenantId,
    idempotencyKey: key,
    requestHash,
    responseStatus: snapshot.status,
    responseHeaders: snapshot.headers,
    responseBody: encodeStoredBody(snapshot.body),
    expiresAt: new Date(now.getTime() + RETENTION_MILLISECONDS),
  });
}

function trustedRequestContext(request: FastifyRequest): RequestContext {
  if (!isAuthenticatedPrincipal(request.principal)) {
    throw new UnauthorizedException({
      code: 'UNAUTHORIZED',
      detail: 'Idempotent commands require a trusted authenticated principal.',
      remediation: 'Sign in again and retry the request.',
    });
  }

  const current = request.requestContext;
  if (current) {
    const samePermissions =
      current.permissions.length === request.principal.permissions.length &&
      current.permissions.every(
        (permission, index) => permission === request.principal?.permissions[index]
      );
    if (
      current.tenantId !== request.principal.tenantId ||
      current.subjectId !== request.principal.subjectId ||
      !samePermissions
    ) {
      throw new UnauthorizedException({
        code: 'UNTRUSTED_REQUEST_CONTEXT',
        detail: 'Request context does not match the authenticated principal.',
        remediation: 'Sign in again and retry the request.',
      });
    }
    return current;
  }

  return buildRequestContext(request as unknown as PrincipalRequest);
}

async function lockCommand(tx: DbTransaction, tenantId: string, key: string): Promise<void> {
  const lockIdentity = `${tenantId}:${key}`;
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${lockIdentity}, 0))`);
}

async function findRecord(tx: DbTransaction, tenantId: string, key: string) {
  const [record] = await tx
    .select()
    .from(idempotencyRecords)
    .where(
      and(eq(idempotencyRecords.tenantId, tenantId), eq(idempotencyRecords.idempotencyKey, key))
    )
    .limit(1);
  return record;
}

function applySnapshot(reply: FastifyReply, snapshot: StoredResponse): void {
  reply.status(snapshot.status);
  for (const [name, value] of Object.entries(snapshot.headers)) {
    reply.header(name, value);
  }
}

function captureResponse(reply: FastifyReply, body: unknown): StoredResponse {
  return {
    body,
    headers: responseHeaders(reply),
    status: reply.statusCode,
  };
}

function responseHeaders(
  reply: FastifyReply
): Readonly<Record<string, string | readonly string[]>> {
  const snapshot: Record<string, string | readonly string[]> = {};
  for (const [name, value] of Object.entries(reply.getHeaders())) {
    const normalizedName = name.toLowerCase();
    if (!REPLAYABLE_RESPONSE_HEADERS.has(normalizedName)) continue;
    if (value === undefined) continue;
    snapshot[normalizedName] = Array.isArray(value) ? value.map(String) : String(value);
  }
  return snapshot;
}

function requestFingerprintHash(request: FastifyRequest, subjectId: string): string {
  const routeTemplate = request.routeOptions?.url || request.url.split('?', 1)[0] || '/';
  return canonicalBodyHash({
    subjectId,
    method: request.method.toUpperCase(),
    route: routeTemplate,
    params: request.params ?? {},
    query: request.query ?? {},
    body: request.body,
  });
}

function isDeterministicHttpException(error: unknown): error is HttpException {
  return error instanceof HttpException && DETERMINISTIC_HTTP_STATUSES.has(error.getStatus());
}

function encodeStoredBody(body: unknown): StoredBodyEnvelope {
  return body === undefined
    ? { __zhiliIdempotencyBody: 1, present: false }
    : { __zhiliIdempotencyBody: 1, present: true, value: body };
}

function decodeStoredBody(body: unknown): unknown {
  if (!isStoredBodyEnvelope(body)) return body;
  return body.present ? body.value : undefined;
}

function isStoredBodyEnvelope(value: unknown): value is StoredBodyEnvelope {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as Record<string, unknown>).__zhiliIdempotencyBody === 1 &&
    typeof (value as Record<string, unknown>).present === 'boolean'
  );
}

function canonicalize(value: unknown): unknown {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (Array.isArray(value)) {
    return value.map((item) =>
      item === undefined || typeof item === 'function' || typeof item === 'symbol'
        ? null
        : canonicalize(item)
    );
  }
  if (typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(value as object).sort()) {
      const child = (value as Record<string, unknown>)[key];
      if (child !== undefined && typeof child !== 'function' && typeof child !== 'symbol') {
        result[key] = canonicalize(child);
      }
    }
    return result;
  }
  return undefined;
}

function newUlid(now = Date.now()): string {
  const random = randomBytes(10).reduce((value, byte) => (value << 8n) | BigInt(byte), 0n);
  return encodeBase32(BigInt(now), 10) + encodeBase32(random, 16);
}

function encodeBase32(value: bigint, length: number): string {
  let encoded = '';
  for (let index = 0; index < length; index += 1) {
    encoded = CROCKFORD_BASE32[Number(value & 31n)] + encoded;
    value >>= 5n;
  }
  return encoded;
}
