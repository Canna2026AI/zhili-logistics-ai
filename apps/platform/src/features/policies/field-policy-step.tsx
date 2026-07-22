import { Button } from '@zhili/ui';
import type { AccessPolicyDraft, FieldPolicy } from './access-policy';

const fieldNames: Record<string, string> = {
  customerPhone: '客户手机号',
  cost: '运单成本',
  receivable: '应收金额',
  recipientIdentity: '签收人证件',
};
export function FieldPolicyStep({
  draft,
  onChange,
  onBack,
  onSimulate,
  onClose,
  busy,
}: {
  draft: AccessPolicyDraft;
  onChange: (draft: AccessPolicyDraft) => void;
  onBack: () => void;
  onSimulate: () => void;
  onClose: () => void;
  busy: boolean;
}) {
  const update = (field: string, decision: FieldPolicy['decision']) =>
    onChange({
      ...draft,
      fieldPolicies: draft.fieldPolicies.map((item) =>
        item.field === field ? { ...item, decision } : item
      ),
    });
  return (
    <section className="f08-workflow-panel" role="dialog" aria-modal="true" aria-label="字段策略">
      <header className="f08-workflow-head">
        <div>
          <h2>字段策略</h2>
          <p>{draft.role.name} · 数据可见性与脱敏</p>
        </div>
        <button type="button" disabled={busy} aria-label="关闭字段策略" onClick={onClose}>
          ×
        </button>
      </header>
      <nav className="f08-steps" aria-label="策略配置步骤">
        <span>模块与配额</span>
        <span>角色策略</span>
        <span>权限预览</span>
        <strong>字段策略</strong>
      </nav>
      <div className="f08-workflow-body">
        <div className="platform-table-wrap" tabIndex={0} aria-label="字段策略矩阵可滚动区域">
          <table className="f08-policy-table" aria-label="字段策略矩阵">
            <thead>
              <tr>
                <th>字段</th>
                <th>决策</th>
                <th>上下文</th>
              </tr>
            </thead>
            <tbody>
              {draft.fieldPolicies.map((policy) => (
                <tr key={policy.field}>
                  <th>{fieldNames[policy.field] ?? policy.field}</th>
                  <td>
                    <select
                      aria-label={`${fieldNames[policy.field] ?? policy.field}字段决策`}
                      value={policy.decision}
                      onChange={(event) =>
                        update(policy.field, event.target.value as FieldPolicy['decision'])
                      }
                    >
                      <option value="READ">可见</option>
                      <option value="MASK">掩码</option>
                      <option value="DENY">关闭</option>
                    </select>
                  </td>
                  <td>{policy.contexts.join(' / ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <footer className="f08-workflow-footer">
        <Button variant="secondary" disabled={busy} onClick={onBack}>
          返回权限预览
        </Button>
        <Button loading={busy} disabled={busy} onClick={onSimulate}>
          以用户视角模拟
        </Button>
      </footer>
    </section>
  );
}
