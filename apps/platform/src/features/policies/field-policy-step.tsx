import { Button } from '@zhili/ui';

const rows = [
  ['客户手机号', '运单联系人信息', '掩码'],
  ['运单成本', '内部成本字段', '关闭'],
  ['应收金额', '账单与对账金额', '掩码'],
  ['签收人证件', 'POD 身份凭证', '掩码'],
] as const;

export function FieldPolicyStep({
  onBack,
  onSimulate,
  onClose,
}: {
  onBack: () => void;
  onSimulate: () => void;
  onClose: () => void;
}) {
  return (
    <section className="f08-workflow-panel" role="dialog" aria-modal="true" aria-label="字段策略">
      <header className="f08-workflow-head">
        <div>
          <h2>字段策略</h2>
          <p>运营管理员 · 数据可见性与脱敏</p>
        </div>
        <button type="button" aria-label="关闭字段策略" onClick={onClose}>
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
        <div className="f08-scope">
          <small>规则范围</small>
          <strong>运单与账单字段</strong>
          <span>继承：租户默认</span>
        </div>
        <table className="f08-policy-table" aria-label="字段策略矩阵">
          <thead>
            <tr>
              <th>字段</th>
              <th>可见</th>
              <th>编辑</th>
              <th>脱敏</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([name, desc, mask]) => (
              <tr key={name}>
                <th>
                  <strong>{name}</strong>
                  <small>{desc}</small>
                </th>
                <td>✓</td>
                <td>—</td>
                <td className={mask === '掩码' ? 'is-remove' : ''}>{mask}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="f08-warning">
          <strong>字段策略优先级高于角色通用权限</strong>
          <span>脱敏字段在列表、详情、导出与 API 中保持一致。</span>
        </div>
      </div>
      <footer className="f08-workflow-footer">
        <Button variant="secondary" onClick={onBack}>
          返回权限预览
        </Button>
        <Button onClick={onSimulate}>以用户视角模拟</Button>
      </footer>
    </section>
  );
}
