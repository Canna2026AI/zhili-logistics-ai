import { Button } from '@zhili/ui';

const permissionRows = [
  ['运单管理', true, true, false],
  ['仓库扫描', true, true, true],
  ['应收应付', true, false, true],
  ['平台设置', true, false, false],
] as const;

export function RolePolicyStep({
  removeLastAdmin,
  onRemoveLastAdminChange,
  onBack,
  onPreview,
  onClose,
}: {
  removeLastAdmin: boolean;
  onRemoveLastAdminChange: (checked: boolean) => void;
  onBack: () => void;
  onPreview: () => void;
  onClose: () => void;
}) {
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
          <p>运营管理员 · 上海智立科技有限公司</p>
        </div>
        <button type="button" aria-label="关闭角色策略" onClick={onClose}>
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
          <small>策略对象</small>
          <strong>运营管理员（12 名成员）</strong>
          <span>作用域：当前租户</span>
        </div>
        <table className="f08-policy-table" aria-label="角色权限矩阵">
          <thead>
            <tr>
              <th>权限域</th>
              <th>查看</th>
              <th>编辑</th>
              <th>审批</th>
            </tr>
          </thead>
          <tbody>
            {permissionRows.map(([name, view, edit, approve]) => (
              <tr key={name}>
                <th>{name}</th>
                {[view, edit, approve].map((allowed, index) => (
                  <td key={index}>
                    <input
                      aria-label={`${name}${['查看', '编辑', '审批'][index]}`}
                      type="checkbox"
                      defaultChecked={allowed}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        <label className="f08-lockout-check">
          <input
            type="checkbox"
            aria-label="撤销最后一个平台管理员"
            checked={removeLastAdmin}
            onChange={(event) => onRemoveLastAdminChange(event.target.checked)}
          />
          <span>
            <strong>撤销最后一个平台管理员</strong>
            <small>用于验证锁定保护；生产环境会在提交前强制阻断。</small>
          </span>
        </label>
        <div className="f08-warning">
          <strong>本次变更：新增 3 项 · 移除 1 项</strong>
          <span>涉及财务审批与平台设置，提交前需要最终权限 Diff。</span>
        </div>
      </div>
      <footer className="f08-workflow-footer">
        <Button variant="secondary" onClick={onBack}>
          返回
        </Button>
        <Button onClick={onPreview}>预览最终权限</Button>
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
      <small>FAILED-LOCKOUT</small>
      <h2>无法发布角色策略</h2>
      <p>该变更将撤销最后一个平台管理员，系统已阻止提交。每个租户必须至少保留 1 名平台管理员。</p>
      <div className="f08-result-detail">保护规则 PLATFORM-ADMIN-MIN-1 · 草稿仍已保留</div>
      <footer>
        <Button variant="secondary" onClick={onClose}>
          关闭
        </Button>
        <Button onClick={onRecover}>返回修正策略</Button>
      </footer>
    </section>
  );
}
