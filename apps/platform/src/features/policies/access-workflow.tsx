import { useEffect, useState, type ReactNode } from 'react';
import type { components } from '@zhili/contracts';
import type { PlatformTenant } from '../tenants/types';
import { AuthorizationStep } from '../tenants/authorization-step';
import { AdminLockoutGuard, RolePolicyStep } from '../roles/role-policy-step';
import { SavedPolicyResult, UserSimulationStep } from '../sessions/user-simulation-step';
import { FieldPolicyStep } from './field-policy-step';
import { PermissionDiffStep } from './permission-diff-step';
import type { AccessPolicyDraft, AccessPolicySaveReceipt } from './access-policy';

type WorkflowStep =
  'authorization' | 'role' | 'diff' | 'field' | 'simulation' | 'saved' | 'lockout';
export interface AccessWorkflowPort {
  previewEffectivePermissions(
    userId: string,
    body: components['schemas']['PermissionPreviewRequest']
  ): Promise<components['schemas']['PermissionPreview']>;
  previewFieldPolicy(
    body: components['schemas']['PreviewFieldPolicyRequest']
  ): Promise<components['schemas']['FieldPolicyPreview']>;
  startPermissionSimulation(
    body: components['schemas']['StartPermissionSimulationRequest']
  ): Promise<components['schemas']['PermissionSimulation']>;
  verifyPermissionSimulation(
    simulationId: string,
    body: components['schemas']['VerifyPermissionRequest']
  ): Promise<components['schemas']['PermissionDecision']>;
  endPermissionSimulation(simulationId: string): Promise<void>;
}
const initialDraft = (tenant: PlatformTenant): AccessPolicyDraft => ({
  tenant: { id: tenant.id, name: tenant.name, version: tenant.version },
  role: { id: '01JROLE000000000000000001', name: '运营管理员', version: 18, memberCount: 12 },
  subject: { id: '01JUSER000000000000000001', name: '李明' },
  modules: [
    {
      moduleCode: 'waybill',
      enabled: true,
      quotas: {
        monthlyWaybills: Number(tenant.waybill.split('/')[1]?.replaceAll(',', '').trim() ?? 0),
      },
    },
    { moduleCode: 'warehouse-scan', enabled: true, quotas: {} },
    { moduleCode: 'booking', enabled: true, quotas: {} },
    { moduleCode: 'last-mile-pod', enabled: true, quotas: {} },
    { moduleCode: 'billing', enabled: true, quotas: {} },
    { moduleCode: 'ai-automation', enabled: false, quotas: {} },
  ],
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
  fieldPolicies: [
    { resource: 'waybill', field: 'customerPhone', decision: 'MASK', contexts: ['VIEW', 'EXPORT'] },
    { resource: 'waybill', field: 'cost', decision: 'DENY', contexts: ['VIEW', 'EXPORT'] },
    { resource: 'invoice', field: 'receivable', decision: 'MASK', contexts: ['VIEW', 'EXPORT'] },
    { resource: 'pod', field: 'recipientIdentity', decision: 'MASK', contexts: ['VIEW', 'EXPORT'] },
  ],
  reason: '季度权限复核',
});

export function AccessWorkflow({
  tenant,
  port,
  mockMode,
  onClose,
  onSave,
}: {
  tenant: PlatformTenant;
  port: AccessWorkflowPort;
  mockMode: boolean;
  onClose: () => void;
  onSave: (draft: AccessPolicyDraft) => Promise<AccessPolicySaveReceipt>;
}) {
  const [step, setStep] = useState<WorkflowStep>('authorization');
  const [draft, setDraft] = useState(() => initialDraft(tenant));
  const [differences, setDifferences] = useState<string[]>([]);
  const [stale, setStale] = useState(false);
  const [removeLastAdmin, setRemoveLastAdmin] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [simulation, setSimulation] = useState<components['schemas']['PermissionSimulation']>();
  const [receipt, setReceipt] = useState<AccessPolicySaveReceipt>();
  const safeClose = () => {
    if (!busy) onClose();
  };
  useEffect(() => {
    const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
    const focusable = () => [
      ...(dialog?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])'
      ) ?? []),
    ];
    focusable()[0]?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (!busy) {
          event.preventDefault();
          onClose();
        }
        return;
      }
      if (event.key !== 'Tab') return;
      const items = focusable();
      if (!items.length) return;
      const first = items[0]!;
      const last = items.at(-1)!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', keydown);
    return () => document.removeEventListener('keydown', keydown);
  }, [step, busy, onClose]);
  const preview = async () => {
    if (mockMode && removeLastAdmin) {
      setStep('lockout');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const value = await port.previewEffectivePermissions(draft.subject.id, {
        proposedRoleIds: [draft.role.id],
        proposedStatements: draft.statements,
      });
      setDifferences(value.differences);
      setStale(false);
      setStep('diff');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '权限预览失败');
    } finally {
      setBusy(false);
    }
  };
  const previewFields = async () => {
    setBusy(true);
    setError('');
    try {
      await port.previewFieldPolicy({
        subjectId: draft.subject.id,
        proposedPolicies: draft.fieldPolicies,
      });
      const value = await port.startPermissionSimulation({
        userId: draft.subject.id,
        reason: draft.reason,
        durationMinutes: 15,
      });
      setSimulation(value);
      setStep('simulation');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '字段策略预览失败');
    } finally {
      setBusy(false);
    }
  };
  const finish = async () => {
    if (!simulation) return;
    setBusy(true);
    setError('');
    try {
      const decision = await port.verifyPermissionSimulation(simulation.id, {
        resource: 'waybill',
        action: 'read',
        field: 'customerPhone',
      });
      if (!decision.allowed) throw new Error(`权限验证被拒绝：${decision.trace.join(' → ')}`);
      await port.endPermissionSimulation(simulation.id);
      const saved = await onSave(draft);
      setReceipt(saved);
      setStep('saved');
    } catch (caught) {
      const status =
        typeof caught === 'object' && caught && 'status' in caught ? Number(caught.status) : 0;
      if (status === 409) {
        setStale(true);
        setStep('diff');
      } else if (status === 422) setStep('lockout');
      else setError(caught instanceof Error ? caught.message : '策略保存失败，请重试。');
    } finally {
      setBusy(false);
    }
  };
  let body: ReactNode = null;
  if (step === 'authorization')
    body = (
      <AuthorizationStep
        draft={draft}
        tenantWaybill={tenant.waybill}
        onChange={setDraft}
        onClose={safeClose}
        onNext={() => setStep('role')}
        disabled={busy}
      />
    );
  else if (step === 'role')
    body = (
      <RolePolicyStep
        draft={draft}
        onChange={setDraft}
        removeLastAdmin={removeLastAdmin}
        onRemoveLastAdminChange={setRemoveLastAdmin}
        onClose={safeClose}
        onBack={() => setStep('authorization')}
        onPreview={() => void preview()}
        mockMode={mockMode}
        busy={busy}
      />
    );
  else if (step === 'lockout')
    body = <AdminLockoutGuard onClose={safeClose} onRecover={() => setStep('role')} />;
  else if (step === 'diff')
    body = (
      <PermissionDiffStep
        draft={draft}
        differences={differences}
        stale={stale}
        onClose={safeClose}
        onBack={() => setStep('role')}
        onStale={() => setStale(true)}
        onReload={() => void preview()}
        onNext={() => setStep('field')}
        mockMode={mockMode}
        busy={busy}
      />
    );
  else if (step === 'field')
    body = (
      <FieldPolicyStep
        draft={draft}
        onChange={setDraft}
        onClose={safeClose}
        onBack={() => setStep('diff')}
        onSimulate={() => void previewFields()}
        busy={busy}
      />
    );
  else if (step === 'simulation' && simulation)
    body = (
      <UserSimulationStep
        draft={draft}
        simulationId={simulation.id}
        expiresAt={simulation.expiresAt}
        onClose={safeClose}
        onFinish={finish}
        saving={busy}
        error={error}
      />
    );
  else if (step === 'saved' && receipt)
    body = <SavedPolicyResult receipt={receipt} onClose={safeClose} />;
  return (
    <div className="f08-workflow-backdrop">
      {body}
      {error && step !== 'simulation' ? (
        <div className="f08-save-error" role="alert">
          {error}
        </div>
      ) : null}
    </div>
  );
}
