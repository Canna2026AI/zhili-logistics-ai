import { useState } from 'react';
import type { PlatformTenant } from '../tenants/types';
import { AuthorizationStep } from '../tenants/authorization-step';
import { AdminLockoutGuard, RolePolicyStep } from '../roles/role-policy-step';
import { SavedPolicyResult, UserSimulationStep } from '../sessions/user-simulation-step';
import { FieldPolicyStep } from './field-policy-step';
import { PermissionDiffStep } from './permission-diff-step';

type WorkflowStep =
  'authorization' | 'role' | 'diff' | 'field' | 'simulation' | 'saved' | 'lockout';

export function AccessWorkflow({
  tenant,
  onClose,
  onSave,
}: {
  tenant: PlatformTenant;
  onClose: () => void;
  onSave: () => Promise<void>;
}) {
  const [step, setStep] = useState<WorkflowStep>('authorization');
  const [stale, setStale] = useState(false);
  const [removeLastAdmin, setRemoveLastAdmin] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const finishSimulation = async () => {
    setSaving(true);
    setSaveError('');
    try {
      await onSave();
      setStep('saved');
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : '策略保存失败，请重试。');
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="f08-workflow-backdrop">
      {step === 'authorization' ? (
        <AuthorizationStep tenant={tenant} onClose={onClose} onNext={() => setStep('role')} />
      ) : null}
      {step === 'role' ? (
        <RolePolicyStep
          removeLastAdmin={removeLastAdmin}
          onRemoveLastAdminChange={setRemoveLastAdmin}
          onClose={onClose}
          onBack={() => setStep('authorization')}
          onPreview={() => setStep(removeLastAdmin ? 'lockout' : 'diff')}
        />
      ) : null}
      {step === 'lockout' ? (
        <AdminLockoutGuard onClose={onClose} onRecover={() => setStep('role')} />
      ) : null}
      {step === 'diff' ? (
        <PermissionDiffStep
          stale={stale}
          onClose={onClose}
          onBack={() => setStep('role')}
          onStale={() => setStale(true)}
          onReload={() => setStale(false)}
          onNext={() => setStep('field')}
        />
      ) : null}
      {step === 'field' ? (
        <FieldPolicyStep
          onClose={onClose}
          onBack={() => setStep('diff')}
          onSimulate={() => setStep('simulation')}
        />
      ) : null}
      {step === 'simulation' ? (
        <UserSimulationStep
          onClose={onClose}
          onFinish={finishSimulation}
          saving={saving}
          error={saveError}
        />
      ) : null}
      {step === 'saved' ? <SavedPolicyResult onClose={onClose} /> : null}
    </div>
  );
}
