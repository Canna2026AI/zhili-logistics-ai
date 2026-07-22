import { Button } from '@zhili/ui';

export type SessionOutcomeKind = 'ended' | 'revoked' | 'expired';

const copy: Record<
  SessionOutcomeKind,
  { eyebrow: string; title: string; body: string; detail: string; action: string }
> = {
  ended: {
    eyebrow: 'IMPERSONATION-ENDED',
    title: '管理员代入已结束',
    body: '临时权限、缓存与访问令牌均已清除。',
    detail: '持续 08:42 · 读取 12 条 · 写入 0 条 · 审计事件 27 条',
    action: '返回平台',
  },
  revoked: {
    eyebrow: 'SESSION-REVOKED',
    title: '当前会话权限已撤回',
    body: '安全管理员发布了紧急策略，当前访问令牌已失效。',
    detail: '撤权事件 ACL-20260723-020 · 权限基线 v20 · 未保存内容已保留为草稿',
    action: '重新登录',
  },
  expired: {
    eyebrow: 'IMPERSONATION-EXPIRED',
    title: '管理员代入已过期',
    body: '会话达到 60 分钟上限，系统已自动撤销代入身份。',
    detail: '临时权限已清除 · 无未提交写入 · 审计链已封存',
    action: '返回平台',
  },
};

export function SessionOutcome({
  kind,
  onRecover,
}: {
  kind: SessionOutcomeKind;
  onRecover: () => void;
}) {
  const value = copy[kind];
  const regionLabel =
    kind === 'revoked' ? '会话已撤权' : kind === 'expired' ? '代入已过期' : '代入已结束';
  return (
    <section
      className={`f08-session-outcome f08-session-outcome--${kind}`}
      role="region"
      aria-label={regionLabel}
    >
      <div className="f08-result-icon">
        {kind === 'ended' ? '✓' : kind === 'expired' ? '⌛' : '!'}
      </div>
      <small>{value.eyebrow}</small>
      <h2>{value.title}</h2>
      <p>{value.body}</p>
      <div className="f08-result-detail">{value.detail}</div>
      <Button onClick={onRecover}>{value.action}</Button>
    </section>
  );
}
