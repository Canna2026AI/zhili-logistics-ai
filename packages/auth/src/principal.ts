const trustedPrincipals = new WeakSet<object>();

export interface AuthenticatedPrincipal {
  readonly tenantId: string;
  readonly subjectId: string;
  readonly permissions: readonly string[];
}

export type AuthenticatedPrincipalInput = AuthenticatedPrincipal;

export function createAuthenticatedPrincipal(
  input: AuthenticatedPrincipalInput
): AuthenticatedPrincipal {
  requireNonEmpty('tenantId', input?.tenantId);
  requireNonEmpty('subjectId', input?.subjectId);
  if (!Array.isArray(input.permissions)) {
    throw new TypeError('Authenticated principal permissions must be an array');
  }

  for (const permission of input.permissions) {
    requireNonEmpty('permissions entry', permission);
  }

  const principal: AuthenticatedPrincipal = Object.freeze({
    tenantId: input.tenantId,
    subjectId: input.subjectId,
    permissions: Object.freeze([...input.permissions]),
  });
  trustedPrincipals.add(principal);
  return principal;
}

export function isAuthenticatedPrincipal(value: unknown): value is AuthenticatedPrincipal {
  return typeof value === 'object' && value !== null && trustedPrincipals.has(value);
}

function requireNonEmpty(name: string, value: unknown): asserts value is string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new TypeError(`Authenticated principal ${name} must be a non-empty string`);
  }
}
