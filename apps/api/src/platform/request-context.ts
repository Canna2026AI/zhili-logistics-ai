import {
  UnauthorizedException,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { randomUUID } from 'node:crypto';
import type { Observable } from 'rxjs';
import type { FastifyReply, FastifyRequest } from 'fastify';
import {
  PUBLIC_ROUTE_METADATA_KEY,
  isAuthenticatedPrincipal,
  type AuthenticatedPrincipal,
} from '@zhili/auth';
import type { TenantContext } from '@zhili/db';

export type RequestContext = TenantContext;

export interface PrincipalRequest {
  readonly body?: unknown;
  readonly headers: Record<string, string | readonly string[] | undefined>;
  readonly principal?: unknown;
  readonly query?: unknown;
  requestContext?: RequestContext;
}

declare module 'fastify' {
  interface FastifyRequest {
    principal?: AuthenticatedPrincipal;
    requestContext?: RequestContext;
  }
}

export function buildRequestContext(request: PrincipalRequest): RequestContext {
  if (!isAuthenticatedPrincipal(request.principal)) {
    throw new UnauthorizedException({
      code: 'UNAUTHORIZED',
      detail: 'Request context requires a trusted authenticated principal.',
      remediation: 'Sign in again and retry the request.',
    });
  }

  return Object.freeze({
    tenantId: request.principal.tenantId,
    subjectId: request.principal.subjectId,
    permissions: Object.freeze([...request.principal.permissions]),
    requestId: requestIdFromHeaders(request.headers),
  });
}

export function requestIdFromHeaders(
  headers: Record<string, string | readonly string[] | undefined>
): string {
  const supplied = headers['x-request-id'];
  if (typeof supplied === 'string' && supplied.trim() !== '') return supplied;
  return randomUUID();
}

export class RequestContextInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector = new Reflector()) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const reply = context.switchToHttp().getResponse<FastifyReply>();
    const isPublic =
      this.reflector.getAllAndOverride<boolean>(PUBLIC_ROUTE_METADATA_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? false;
    if (isPublic) {
      reply.header(
        'x-request-id',
        requestIdFromHeaders(
          request.headers as Record<string, string | readonly string[] | undefined>
        )
      );
      return next.handle();
    }

    const requestContext = buildRequestContext(request as unknown as PrincipalRequest);
    request.requestContext = requestContext;
    reply.header('x-request-id', requestContext.requestId);
    return next.handle();
  }
}
