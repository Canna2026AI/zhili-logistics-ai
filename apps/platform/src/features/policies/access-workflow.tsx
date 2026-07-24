import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import type { components } from '@zhili/contracts';
import type { PlatformTenant } from '../tenants/types';
import { AuthorizationStep } from '../tenants/authorization-step';
import { AdminLockoutGuard, RolePolicyStep } from '../roles/role-policy-step';
import { SavedPolicyResult, UserSimulationStep } from '../sessions/user-simulation-step';
import { FieldPolicyStep } from './field-policy-step';
import { PermissionDiffStep } from './permission-diff-step';
import type {
  AccessPolicyBaselineRefresh,
  AccessPolicyCatalog,
  AccessPolicyDraft,
  AccessPolicySaveReceipt,
} from './access-policy';

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
    body: components['schemas']['StartPermissionSimulationRequest'],
    idempotencyKey?: string
  ): Promise<components['schemas']['PermissionSimulation']>;
  verifyPermissionSimulation(
    simulationId: string,
    body: components['schemas']['VerifyPermissionRequest']
  ): Promise<components['schemas']['PermissionDecision']>;
  endPermissionSimulation(simulationId: string): Promise<void>;
  reloadAccessPolicyBaseline(
    tenantId: string,
    tenantVersion: number,
    roleId: string,
    roleVersion: number,
    userId: string
  ): Promise<AccessPolicyBaselineRefresh>;
}
const initialDraft = (tenant: PlatformTenant, catalog: AccessPolicyCatalog): AccessPolicyDraft => {
  const role = catalog.roles[0]!;
  const subject = catalog.subjects[0]!;
  return {
    tenant: { id: tenant.id, name: tenant.name, version: tenant.version },
    role: {
      id: role.id,
      name: role.name,
      version: role.version,
      memberCount: role.memberCount,
    },
    subject,
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
    statements: role.statements.map((statement) => ({
      ...statement,
      actions: [...statement.actions],
    })),
    fieldPolicies: [
      {
        resource: 'waybill',
        field: 'customerPhone',
        decision: 'MASK',
        contexts: ['VIEW', 'EXPORT'],
      },
      { resource: 'waybill', field: 'cost', decision: 'DENY', contexts: ['VIEW', 'EXPORT'] },
      { resource: 'invoice', field: 'receivable', decision: 'MASK', contexts: ['VIEW', 'EXPORT'] },
      {
        resource: 'pod',
        field: 'recipientIdentity',
        decision: 'MASK',
        contexts: ['VIEW', 'EXPORT'],
      },
    ],
    reason: '季度权限复核',
  };
};

const intentKey = () => `platform-ui-${crypto.randomUUID?.() ?? Date.now()}`;
const errorStatus = (error: unknown) =>
  typeof error === 'object' && error && 'status' in error ? Number(error.status) : 0;
const errorCode = (error: unknown) =>
  typeof error === 'object' && error && 'code' in error ? String(error.code) : '';
const lockoutCodes = new Set(['LAST_ADMIN', 'ADMIN_LOCKOUT', 'ADMIN_REQUIRED', 'IAM_LAST_ADMIN']);
const expiredSimulationCodes = new Set([
  'SIMULATION_EXPIRED',
  'PERMISSION_SIMULATION_EXPIRED',
  'IAM_SIMULATION_EXPIRED',
]);

export function AccessWorkflow({
  tenant,
  port,
  mockMode,
  onClose,
  onSave,
  catalog,
  onBaselineReloaded,
}: {
  tenant: PlatformTenant;
  port: AccessWorkflowPort;
  mockMode: boolean;
  onClose: () => void;
  onSave: (draft: AccessPolicyDraft) => Promise<AccessPolicySaveReceipt>;
  catalog: AccessPolicyCatalog;
  onBaselineReloaded: (baseline: AccessPolicyBaselineRefresh) => void;
}) {
  const [step, setStep] = useState<WorkflowStep>('authorization');
  const [draft, setDraft] = useState(() => initialDraft(tenant, catalog));
  const [differences, setDifferences] = useState<string[]>([]);
  const [stale, setStale] = useState(false);
  const [removeLastAdmin, setRemoveLastAdmin] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [simulation, setSimulation] = useState<components['schemas']['PermissionSimulation']>();
  const [receipt, setReceipt] = useState<AccessPolicySaveReceipt>();
  const closingRef = useRef(false);
  const simulationStartRef = useRef(false);
  const simulationStartKeyRef = useRef<string | undefined>(undefined);
  const savedReceiptRef = useRef<AccessPolicySaveReceipt | undefined>(undefined);
  const safeClose = useCallback(async () => {
    if (busy || closingRef.current) return;
    closingRef.current = true;
    if (simulation) {
      setBusy(true);
      setError('');
      try {
        await port.endPermissionSimulation(simulation.id);
        setSimulation(undefined);
      } catch (caught) {
        if (![404, 410].includes(errorStatus(caught))) {
          setError(caught instanceof Error ? caught.message : '模拟会话退出失败，请重试。');
          setBusy(false);
          closingRef.current = false;
          return;
        }
      }
    }
    onClose();
  }, [busy, onClose, port, simulation]);
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
          void safeClose();
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
  }, [step, busy, safeClose]);
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
    if (simulationStartRef.current) return;
    simulationStartRef.current = true;
    setBusy(true);
    setError('');
    try {
      await port.previewFieldPolicy({
        subjectId: draft.subject.id,
        proposedPolicies: draft.fieldPolicies,
      });
      simulationStartKeyRef.current ??= intentKey();
      const value = await port.startPermissionSimulation(
        {
          userId: draft.subject.id,
          reason: draft.reason,
          durationMinutes: 15,
        },
        simulationStartKeyRef.current
      );
      simulationStartKeyRef.current = undefined;
      setSimulation(value);
      setStep('simulation');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '字段策略预览失败');
    } finally {
      simulationStartRef.current = false;
      setBusy(false);
    }
  };
  const reload = async () => {
    setBusy(true);
    setError('');
    try {
      const baseline = await port.reloadAccessPolicyBaseline(
        draft.tenant.id,
        draft.tenant.version,
        draft.role.id,
        draft.role.version,
        draft.subject.id
      );
      const nextDraft: AccessPolicyDraft = {
        ...draft,
        tenant: { ...draft.tenant, version: baseline.tenantVersion },
        role: {
          id: baseline.role.id,
          name: baseline.role.name,
          version: baseline.role.version,
          memberCount: baseline.role.memberCount,
        },
        statements: baseline.role.statements.map((statement) => ({
          ...statement,
          actions: [...statement.actions],
        })),
      };
      const value = await port.previewEffectivePermissions(nextDraft.subject.id, {
        proposedRoleIds: [nextDraft.role.id],
        proposedStatements: nextDraft.statements,
      });
      onBaselineReloaded(baseline);
      setDraft(nextDraft);
      setDifferences(value.differences);
      setStale(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '权限基线重新加载失败');
    } finally {
      setBusy(false);
    }
  };
  const finish = async () => {
    if (!simulation) return;
    setBusy(true);
    setError('');
    try {
      let saved = savedReceiptRef.current;
      if (!saved) {
        const decision = await port.verifyPermissionSimulation(simulation.id, {
          resource: 'waybill',
          action: 'read',
          field: 'customerPhone',
        });
        if (!decision.allowed) throw new Error(`权限验证被拒绝：${decision.trace.join(' → ')}`);
        saved = await onSave(draft);
        savedReceiptRef.current = saved;
      }
      await port.endPermissionSimulation(simulation.id);
      setSimulation(undefined);
      setReceipt(saved);
      setStep('saved');
    } catch (caught) {
      const status = errorStatus(caught);
      const code = errorCode(caught);
      if (savedReceiptRef.current && (status === 404 || status === 410)) {
        setSimulation(undefined);
        setReceipt(savedReceiptRef.current);
        setStep('saved');
      } else if (status === 409 || status === 412) {
        try {
          await port.endPermissionSimulation(simulation.id);
        } catch {
          // The stale response is still authoritative; the session is cleared client-side below.
        }
        savedReceiptRef.current = undefined;
        setSimulation(undefined);
        setStale(true);
        setStep('diff');
      } else if (status === 410 && expiredSimulationCodes.has(code)) {
        savedReceiptRef.current = undefined;
        setSimulation(undefined);
        setStep('field');
        setError('模拟会话已过期，请重新创建。');
      } else if (status === 422 && lockoutCodes.has(code)) setStep('lockout');
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
        catalog={catalog}
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
        onReload={() => void reload()}
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
