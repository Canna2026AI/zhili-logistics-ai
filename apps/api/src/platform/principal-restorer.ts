import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { FastifyRequest } from 'fastify';
import { AuthenticatedPrincipalGuard } from '@zhili/auth';

export const API_PRINCIPAL_RESTORER = Symbol('API_PRINCIPAL_RESTORER');

export interface ApiPrincipalRestorer {
  restore(request: FastifyRequest): Promise<void>;
}

export class RestoringAuthenticatedPrincipalGuard implements CanActivate {
  private readonly authenticatedPrincipalGuard: AuthenticatedPrincipalGuard;

  constructor(
    reflector: Reflector,
    private readonly restorer?: ApiPrincipalRestorer
  ) {
    this.authenticatedPrincipalGuard = new AuthenticatedPrincipalGuard(reflector);
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (this.restorer) {
      try {
        await this.restorer.restore(context.switchToHttp().getRequest<FastifyRequest>());
      } catch {
        // Restoration is an authentication hint, never an availability bypass. The canonical
        // authentication guard below decides whether this route may proceed without a principal.
      }
    }
    return this.authenticatedPrincipalGuard.canActivate(context);
  }
}
