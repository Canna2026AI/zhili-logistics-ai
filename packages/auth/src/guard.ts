import {
  ForbiddenException,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { isAuthenticatedPrincipal } from './principal';
import { PERMISSIONS_METADATA_KEY, PUBLIC_ROUTE_METADATA_KEY } from './permission';

export class AuthenticatedPrincipalGuard implements CanActivate {
  constructor(private readonly reflector: Reflector = new Reflector()) {}

  canActivate(context: ExecutionContext): boolean {
    if (isPublicRoute(this.reflector, context)) return true;
    const request = context.switchToHttp().getRequest<{ principal?: unknown }>();
    if (!isAuthenticatedPrincipal(request.principal)) {
      throw new UnauthorizedException({
        code: 'UNAUTHORIZED',
        detail: 'An authenticated principal is required.',
        remediation: 'Sign in again and retry the request.',
      });
    }
    return true;
  }
}

export class PermissionGuard implements CanActivate {
  constructor(private readonly reflector: Reflector = new Reflector()) {}

  canActivate(context: ExecutionContext): boolean {
    if (isPublicRoute(this.reflector, context)) return true;
    const request = context.switchToHttp().getRequest<{ principal?: unknown }>();
    if (!isAuthenticatedPrincipal(request.principal)) {
      throw new UnauthorizedException({
        code: 'UNAUTHORIZED',
        detail: 'An authenticated principal is required.',
        remediation: 'Sign in again and retry the request.',
      });
    }

    const required =
      this.reflector.getAllAndOverride<readonly string[]>(PERMISSIONS_METADATA_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? [];
    const granted = new Set(request.principal.permissions);
    const missing = required.filter((permission) => !granted.has(permission));
    if (missing.length > 0) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        detail: `Missing required permissions: ${missing.join(', ')}`,
        remediation: 'Request the required permissions from a tenant administrator.',
      });
    }
    return true;
  }
}

function isPublicRoute(reflector: Reflector, context: ExecutionContext): boolean {
  return (
    reflector.getAllAndOverride<boolean>(PUBLIC_ROUTE_METADATA_KEY, [
      context.getHandler(),
      context.getClass(),
    ]) ?? false
  );
}
