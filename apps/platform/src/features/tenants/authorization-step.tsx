import { Button } from '@zhili/ui';
import type { AccessPolicyDraft } from '../policies/access-policy';

const labels: Record<string, [string, string]> = {
  waybill: ['运单管理', '创建、跟踪、状态管理'],
  'warehouse-scan': ['仓库扫描', '出入库、盘点、库存查询'],
  booking: ['订舱 / 提单', '订舱、提单、放舱'],
  'last-mile-pod': ['尾程配送与 POD', '派送、签收、POD 管理'],
  billing: ['应收应付与微信支付', '账单、对账、支付管理'],
  'ai-automation': ['AI 自动化', '映射建议与高风险审批'],
};

export function AuthorizationStep({
  draft,
  tenantWaybill,
  onChange,
  onNext,
  onClose,
  disabled = false,
}: {
  draft: AccessPolicyDraft;
  tenantWaybill: string;
  onChange: (draft: AccessPolicyDraft) => void;
  onNext: () => void;
  onClose: () => void;
  disabled?: boolean;
}) {
  const updateModule = (
    moduleCode: string,
    change: Partial<AccessPolicyDraft['modules'][number]>
  ) =>
    onChange({
      ...draft,
      modules: draft.modules.map((item) =>
        item.moduleCode === moduleCode ? { ...item, ...change } : item
      ),
    });
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
            {draft.tenant.name} · {draft.tenant.id}
          </p>
        </div>
        <span className="f08-state f08-state--success">正常</span>
        <button type="button" disabled={disabled} aria-label="关闭授权配置" onClick={onClose}>
          ×
        </button>
      </header>
      <div className="f08-workflow-body">
        <h3>授权模块</h3>
        <div className="f08-entitlements">
          {draft.modules.map((module) => {
            const [label, description] = labels[module.moduleCode] ?? [
              module.moduleCode,
              '租户模块',
            ];
            return (
              <label key={module.moduleCode}>
                <span>
                  <strong>{label}</strong>
                  <small>{description}</small>
                </span>
                <input
                  type="checkbox"
                  role="switch"
                  checked={module.enabled}
                  aria-label={`授权 ${label}`}
                  onChange={(event) =>
                    updateModule(module.moduleCode, { enabled: event.target.checked })
                  }
                />
              </label>
            );
          })}
        </div>
        <h3>配额与到期</h3>
        <div className="f08-quota-grid">
          <label>
            运单配额 <span>{tenantWaybill}</span>
            <input
              aria-label="授权运单配额"
              inputMode="numeric"
              value={
                draft.modules.find((item) => item.moduleCode === 'waybill')?.quotas
                  .monthlyWaybills ?? 0
              }
              onChange={(event) =>
                updateModule('waybill', { quotas: { monthlyWaybills: Number(event.target.value) } })
              }
            />
          </label>
          <article>
            <span>API 用量</span>
            <strong>由服务端计量</strong>
          </article>
          <article>
            <span>有效期</span>
            <strong>{draft.modules[0]?.expiresAt?.slice(0, 10) ?? '长期有效'}</strong>
          </article>
        </div>
        <div className="f08-warning">
          <strong>管理员代入与授权变更均写入审计。</strong>
          <span>最终版本只使用服务端保存回执。</span>
        </div>
      </div>
      <footer className="f08-workflow-footer">
        <Button variant="secondary" disabled={disabled} onClick={onClose}>
          取消
        </Button>
        <Button disabled={disabled} onClick={onNext}>
          继续：角色策略
        </Button>
      </footer>
    </section>
  );
}
