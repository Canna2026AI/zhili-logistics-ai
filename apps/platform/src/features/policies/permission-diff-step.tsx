import { Button } from '@zhili/ui';
import type { AccessPolicyDraft } from './access-policy';

export function PermissionDiffStep({
  draft,
  differences,
  stale,
  onStale,
  onReload,
  onBack,
  onNext,
  onClose,
  mockMode,
  busy,
}: {
  draft: AccessPolicyDraft;
  differences: string[];
  stale: boolean;
  onStale: () => void;
  onReload: () => void;
  onBack: () => void;
  onNext: () => void;
  onClose: () => void;
  mockMode: boolean;
  busy: boolean;
}) {
  const label = stale ? '最终权限 Diff · STALE' : '最终权限 Diff';
  return (
    <section className="f08-workflow-panel" role="dialog" aria-modal="true" aria-label={label}>
      <header className="f08-workflow-head">
        <div>
          <h2>最终权限 Diff</h2>
          <p>
            服务端基线 v{draft.role.version} · {draft.role.name}
          </p>
        </div>
        <button type="button" disabled={busy} aria-label="关闭权限预览" onClick={onClose}>
          ×
        </button>
      </header>
      <nav className="f08-steps" aria-label="策略配置步骤">
        <span>模块与配额</span>
        <span>角色策略</span>
        <strong>权限预览</strong>
        <span>字段策略</span>
      </nav>
      <div className="f08-workflow-body">
        <div className="f08-scope">
          <small>变更对象</small>
          <strong>
            {draft.role.name} · {draft.role.memberCount} 名成员
          </strong>
          <span>用户：{draft.subject.name}</span>
        </div>
        <ul aria-label="服务端权限差异">
          {differences.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <div className={stale ? 'f08-warning' : 'f08-success'} role="status">
          <strong>
            {stale
              ? 'STALE · 权限基线已由其他管理员更新'
              : `权限基线已同步 · ${differences.join(' · ')}`}
          </strong>
          <span>
            {stale ? '必须重新请求服务端预览。' : '当前 Diff 来自 effective-permissions preview。'}
          </span>
        </div>
        {mockMode && !stale ? (
          <Button variant="secondary" onClick={onStale}>
            模拟版本冲突
          </Button>
        ) : null}
      </div>
      <footer className="f08-workflow-footer">
        <Button variant="secondary" disabled={busy} onClick={onBack}>
          返回编辑
        </Button>
        {stale ? (
          <Button loading={busy} onClick={onReload}>
            重新加载并比较
          </Button>
        ) : (
          <Button onClick={onNext}>确认并配置字段</Button>
        )}
      </footer>
    </section>
  );
}
