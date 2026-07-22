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

export interface AccessRolePolicyBaseline {
  id: string;
  name: string;
  version: number;
  memberCount: number;
  statements: PolicyStatement[];
}

export interface AccessPolicySubject {
  id: string;
  name: string;
}

export interface AccessPolicyCatalog {
  roles: AccessRolePolicyBaseline[];
  subjects: AccessPolicySubject[];
}

export interface AccessPolicyBaselineRefresh {
  tenantId: string;
  tenantVersion: number;
  role: AccessRolePolicyBaseline;
  subjects: AccessPolicySubject[];
}

export const createAccessPolicyCatalog = (): AccessPolicyCatalog => ({
  roles: [
    {
      id: '01JROLE000000000000000001',
      name: '运营管理员',
      version: 18,
      memberCount: 12,
      statements: [
        { effect: 'ALLOW', resource: 'waybill', actions: ['read', 'write'], dataScope: 'TENANT' },
        {
          effect: 'ALLOW',
          resource: 'warehouse',
          actions: ['read', 'write', 'approve'],
          dataScope: 'TENANT',
        },
        { effect: 'ALLOW', resource: 'billing', actions: ['read', 'approve'], dataScope: 'TENANT' },
        { effect: 'ALLOW', resource: 'platform', actions: ['read'], dataScope: 'TENANT' },
      ],
    },
    {
      id: '01JROLE000000000000000002',
      name: '财务管理员',
      version: 7,
      memberCount: 4,
      statements: [
        { effect: 'ALLOW', resource: 'waybill', actions: ['read'], dataScope: 'TENANT' },
        { effect: 'ALLOW', resource: 'warehouse', actions: ['read'], dataScope: 'TENANT' },
        { effect: 'ALLOW', resource: 'billing', actions: ['read', 'approve'], dataScope: 'TENANT' },
        { effect: 'ALLOW', resource: 'platform', actions: ['read'], dataScope: 'TENANT' },
      ],
    },
  ],
  subjects: [
    { id: '01JUSER000000000000000001', name: '李明' },
    { id: '01JUSER000000000000000002', name: '王芳' },
  ],
});
