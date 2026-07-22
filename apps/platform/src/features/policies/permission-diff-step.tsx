import { Button } from '@zhili/ui';

export function PermissionDiffStep({
  stale,
  onStale,
  onReload,
  onBack,
  onNext,
  onClose,
}: {
  stale: boolean;
  onStale: () => void;
  onReload: () => void;
  onBack: () => void;
  onNext: () => void;
  onClose: () => void;
}) {
  const label = stale ? '最终权限 Diff · STALE' : '最终权限 Diff';
  return (
    <section className="f08-workflow-panel" role="dialog" aria-modal="true" aria-label={label}>
      <header className="f08-workflow-head">
        <div>
          <h2>最终权限 Diff</h2>
          <p>基线版本 v18 · 当前草稿 v19</p>
        </div>
        <button type="button" aria-label="关闭权限预览" onClick={onClose}>
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
          <strong>运营管理员 · 12 名成员</strong>
          <span>比较：v18 → v19</span>
        </div>
        <table className="f08-policy-table" aria-label="最终权限差异">
          <thead>
            <tr>
              <th>权限域</th>
              <th>查看</th>
              <th>编辑</th>
              <th>审批</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th>运单管理</th>
              <td className="is-add">+</td>
              <td className="is-add">+</td>
              <td>—</td>
            </tr>
            <tr>
              <th>仓库扫描</th>
              <td>=</td>
              <td>=</td>
              <td>=</td>
            </tr>
            <tr>
              <th>应收应付</th>
              <td>=</td>
              <td className="is-remove">−</td>
              <td className="is-add">+</td>
            </tr>
            <tr>
              <th>平台设置</th>
              <td className="is-add">+</td>
              <td>—</td>
              <td>—</td>
            </tr>
          </tbody>
        </table>
        <div className={stale ? 'f08-warning' : 'f08-success'} role="status">
          <strong>
            {stale
              ? 'STALE · 权限基线已由其他管理员更新'
              : '权限基线已同步 · 新增 3 项 · 移除 1 项'}
          </strong>
          <span>
            {stale
              ? '当前 Diff 基于旧版本 v18；重新加载后才能继续。'
              : '当前 Diff 基于最新版本 v19，可继续配置字段策略。'}
          </span>
        </div>
        {!stale ? (
          <Button variant="secondary" onClick={onStale}>
            模拟版本冲突
          </Button>
        ) : null}
      </div>
      <footer className="f08-workflow-footer">
        <Button variant="secondary" onClick={onBack}>
          返回编辑
        </Button>
        {stale ? (
          <Button onClick={onReload}>重新加载并比较</Button>
        ) : (
          <Button onClick={onNext}>确认并配置字段</Button>
        )}
      </footer>
    </section>
  );
}
