import { Button } from '@zhili/ui';
import type { PlatformTenant } from './types';

const entitlements = [
  ['运单管理', '创建、跟踪、状态管理'],
  ['仓库扫描', '出入库、盘点、库存查询'],
  ['订舱 / 提单', '订舱、提单、放舱'],
  ['尾程配送与 POD', '派送、签收、POD 管理'],
  ['应收应付与微信支付', '账单、对账、支付管理'],
  ['AI 自动化', '映射建议与高风险审批'],
] as const;

export function AuthorizationStep({
  tenant,
  onNext,
  onClose,
}: {
  tenant: PlatformTenant;
  onNext: () => void;
  onClose: () => void;
}) {
  return (
    <section
      className="f08-workflow-panel"
      role="dialog"
      aria-modal="true"
      aria-label="租户详情 · 授权配置"
    >
      <header className="f08-workflow-head">
        <div>
          <h2>租户详情 · 授权配置</h2>
          <p>
            {tenant.name} · {tenant.slug}
          </p>
        </div>
        <span className="f08-state f08-state--success">正常</span>
        <button type="button" aria-label="关闭授权配置" onClick={onClose}>
          ×
        </button>
      </header>
      <div className="f08-workflow-body">
        <h3>授权模块</h3>
        <div className="f08-entitlements">
          {entitlements.map(([label, description], index) => (
            <label key={label}>
              <span>
                <strong>{label}</strong>
                <small>{description}</small>
              </span>
              <input
                type="checkbox"
                role="switch"
                defaultChecked={index !== entitlements.length - 1}
                aria-label={`授权 ${label}`}
              />
            </label>
          ))}
        </div>
        <h3>配额与到期</h3>
        <div className="f08-quota-grid">
          <article>
            <span>运单配额</span>
            <strong>{tenant.waybill}</strong>
          </article>
          <article>
            <span>API 用量</span>
            <strong>{tenant.api}</strong>
          </article>
          <article>
            <span>有效期</span>
            <strong>{tenant.expires}</strong>
          </article>
        </div>
        <div className="f08-warning">
          <strong>管理员代入与授权变更均写入审计，默认会话最长 60 分钟。</strong>
          <span>保存后生成新版本 v19；即时撤权会终止受影响会话。</span>
        </div>
      </div>
      <footer className="f08-workflow-footer">
        <Button variant="secondary" onClick={onClose}>
          取消
        </Button>
        <Button onClick={onNext}>继续：角色策略</Button>
      </footer>
    </section>
  );
}
