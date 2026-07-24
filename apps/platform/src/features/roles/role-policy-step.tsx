import { Button } from '@zhili/ui';
import type {
  AccessPolicyCatalog,
  AccessPolicyDraft,
  PolicyStatement,
} from '../policies/access-policy';

const resources = [
  ['waybill', '运单管理'],
  ['warehouse', '仓库扫描'],
  ['billing', '应收应付'],
  ['platform', '平台设置'],
] as const;
const actions = [
  ['read', '查看'],
  ['write', '编辑'],
  ['approve', '审批'],
] as const;

export function RolePolicyStep({
  draft,
  onChange,
  removeLastAdmin,
  onRemoveLastAdminChange,
  onBack,
  onPreview,
  onClose,
  mockMode,
  busy,
  catalog,
}: {
  draft: AccessPolicyDraft;
  onChange: (draft: AccessPolicyDraft) => void;
  removeLastAdmin: boolean;
  onRemoveLastAdminChange: (checked: boolean) => void;
  onBack: () => void;
  onPreview: () => void;
  onClose: () => void;
  mockMode: boolean;
  busy: boolean;
  catalog: AccessPolicyCatalog;
}) {
  const toggle = (resource: string, action: string, allowed: boolean) => {
    const current = draft.statements.find((item) => item.resource === resource);
    const next: PolicyStatement = current ?? {
      effect: 'ALLOW',
      resource,
      actions: [],
      dataScope: 'TENANT',
    };
    const updated = {
      ...next,
      actions: allowed
        ? [...new Set([...next.actions, action])]
        : next.actions.filter((item) => item !== action),
    };
    onChange({
      ...draft,
      statements: [...draft.statements.filter((item) => item.resource !== resource), updated],
    });
  };
  return (
    <section
      className="f08-workflow-panel"
      role="dialog"
      aria-modal="true"
      aria-label="角色策略编辑"
    >
      <header className="f08-workflow-head">
        <div>
          <h2>角色策略编辑</h2>
          <p>
            {draft.role.name} · {draft.tenant.name}
          </p>
        </div>
        <button type="button" disabled={busy} aria-label="关闭角色策略" onClick={onClose}>
          ×
        </button>
      </header>
      <nav className="f08-steps" aria-label="策略配置步骤">
        <span>模块与配额</span>
        <strong>角色策略</strong>
        <span>权限预览</span>
        <span>字段策略</span>
      </nav>
      <div className="f08-workflow-body">
        <div className="f08-scope">
          <label>
            策略对象
            <select
              aria-label="策略角色"
              value={draft.role.id}
              onChange={(event) => {
                const role = catalog.roles.find((item) => item.id === event.target.value);
                if (!role) return;
                onChange({
                  ...draft,
                  role: {
                    id: role.id,
                    name: role.name,
                    version: role.version,
                    memberCount: role.memberCount,
                  },
                  statements: role.statements.map((statement) => ({
                    ...statement,
                    actions: [...statement.actions],
                  })),
                });
              }}
            >
              {catalog.roles.map((role) => (
                <option key={role.id} value={role.id}>
                  {role.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            模拟用户
            <select
              aria-label="模拟用户"
              value={draft.subject.id}
              onChange={(event) => {
                const subject = catalog.subjects.find((item) => item.id === event.target.value);
                if (subject) onChange({ ...draft, subject });
              }}
            >
              {catalog.subjects.map((subject) => (
                <option key={subject.id} value={subject.id}>
                  {subject.name}
                </option>
              ))}
            </select>
          </label>
          <span>作用域：当前租户</span>
        </div>
        <div className="platform-table-wrap" tabIndex={0} aria-label="角色权限矩阵可滚动区域">
          <table className="f08-policy-table" aria-label="角色权限矩阵">
            <thead>
              <tr>
                <th>权限域</th>
                {actions.map(([, label]) => (
                  <th key={label}>{label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {resources.map(([resource, label]) => (
                <tr key={resource}>
                  <th>{label}</th>
                  {actions.map(([action, actionLabel]) => (
                    <td key={action}>
                      <input
                        aria-label={`${label}${actionLabel}`}
                        type="checkbox"
                        checked={
                          draft.statements
                            .find((item) => item.resource === resource)
                            ?.actions.includes(action) ?? false
                        }
                        onChange={(event) => toggle(resource, action, event.target.checked)}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {mockMode ? (
          <label className="f08-lockout-check">
            <input
              type="checkbox"
              aria-label="撤销最后一个平台管理员"
              checked={removeLastAdmin}
              onChange={(event) => onRemoveLastAdminChange(event.target.checked)}
            />
            <span>
              <strong>撤销最后一个平台管理员</strong>
              <small>Mock 契约返回 422 锁定保护。</small>
            </span>
          </label>
        ) : null}
      </div>
      <footer className="f08-workflow-footer">
        <Button variant="secondary" disabled={busy} onClick={onBack}>
          返回
        </Button>
        <Button loading={busy} disabled={busy} onClick={onPreview}>
          预览最终权限
        </Button>
      </footer>
    </section>
  );
}

export function AdminLockoutGuard({
  onRecover,
  onClose,
}: {
  onRecover: () => void;
  onClose: () => void;
}) {
  return (
    <section
      className="f08-result-dialog f08-result-dialog--danger"
      role="dialog"
      aria-modal="true"
      aria-label="管理员账号锁定保护"
    >
      <div className="f08-result-icon">!</div>
      <small>FAILED-LOCKOUT · 422</small>
      <h2>无法发布角色策略</h2>
      <p>服务端锁定保护要求至少保留 1 名平台管理员。</p>
      <div className="f08-result-detail">草稿仍完整保留</div>
      <footer>
        <Button variant="secondary" onClick={onClose}>
          关闭
        </Button>
        <Button onClick={onRecover}>返回修正策略</Button>
      </footer>
    </section>
  );
}
