import type { components } from '@zhili/contracts';

export type EntitlementModule = components['schemas']['TenantModuleEntitlementInput'];
export type PolicyStatement = components['schemas']['PolicyStatement'];
export type FieldPolicy = components['schemas']['FieldPolicyInput'];

export interface AccessPolicyDraft {
  tenant: { id: string; name: string; version: number };
  role: { id: string; name: string; version: number; memberCount: number };
  subject: { id: string; name: string };
  modules: EntitlementModule[];
  statements: PolicyStatement[];
  fieldPolicies: FieldPolicy[];
  reason: string;
}

export interface AccessPolicySaveReceipt {
  tenantId: string;
  tenantVersion: number;
  roleId: string;
  roleVersion: number;
  subjectId: string;
  effectiveModuleCount: number;
  savedAt: string;
}
