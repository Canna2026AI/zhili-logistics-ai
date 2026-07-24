import { Button } from '@zhili/ui';
import type { AccessPolicyDraft, AccessPolicySaveReceipt } from '../policies/access-policy';

const shipments = [
  ['YT202607230018', '上海华光 / 138****6612', '上海 → 杭州', '¥ **,***', '运输中'],
  ['YT202607230014', '杭州新航 / 151****0821', '杭州 → 南京', '¥ **,***', '运输中'],
] as const;
export function UserSimulationStep({
  draft,
  simulationId,
  expiresAt,
  onFinish,
  onClose,
  saving = false,
  error = '',
}: {
  draft: AccessPolicyDraft;
  simulationId: string;
  expiresAt: string;
  onFinish: () => void | Promise<void>;
  onClose: () => void | Promise<void>;
  saving?: boolean;
  error?: string;
}) {
  return (
    <section className="f08-simulation" role="dialog" aria-modal="true" aria-label="用户视角模拟">
      <header>
        <span className="f08-session-chip">SESSION {simulationId.slice(-6)}</span>
        <strong>
          正在以 {draft.subject.name} / {draft.role.name} 的视角模拟
        </strong>
        <Button variant="secondary" disabled={saving} onClick={() => void onClose()}>
          退出模拟
        </Button>
        <Button disabled={saving} onClick={() => void onFinish()}>
          {saving ? '正在保存策略' : '结束模拟并验证'}
        </Button>
      </header>
      <div className="f08-simulation-body">
        <div className="f08-simulation-title">
          <div>
            <h2>运单管理 · 用户视角</h2>
            <p>角色基线 v{draft.role.version} · 字段策略已由服务端预览</p>
          </div>
          <span>策略校验中</span>
        </div>
        <div className="platform-table-wrap" tabIndex={0} aria-label="模拟运单可滚动区域">
          <table className="f08-simulation-table" aria-label="模拟运单列表">
            <thead>
              <tr>
                <th>运单号</th>
                <th>客户 / 手机号</th>
                <th>线路</th>
                <th>应收金额</th>
                <th>状态</th>
              </tr>
            </thead>
            <tbody>
              {shipments.map((row) => (
                <tr key={row[0]}>
                  {row.map((value) => (
                    <td key={value}>{value}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="f08-warning">模拟会话到期：{expiresAt}</div>
        {error ? (
          <div className="f08-save-error" role="alert">
            {error}
          </div>
        ) : null}
      </div>
    </section>
  );
}

export function SavedPolicyResult({
  receipt,
  onClose,
}: {
  receipt: AccessPolicySaveReceipt;
  onClose: () => void;
}) {
  return (
    <section
      className="f08-result-dialog f08-result-dialog--success"
      role="dialog"
      aria-modal="true"
      aria-label="角色策略已验证并保存"
    >
      <div className="f08-result-icon">✓</div>
      <small>SAVED</small>
      <h2>角色策略已验证并保存</h2>
      <p>
        服务端角色版本 v{receipt.roleVersion} 已生效；租户授权版本 v{receipt.tenantVersion} 已生效。
      </p>
      <div className="f08-result-detail">
        租户 {receipt.tenantId} · 角色 {receipt.roleId} · 用户 {receipt.subjectId} ·{' '}
        {receipt.effectiveModuleCount} 个模块
      </div>
      <footer>
        <Button onClick={onClose}>完成</Button>
      </footer>
    </section>
  );
}
