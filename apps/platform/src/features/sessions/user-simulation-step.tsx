import { Button } from '@zhili/ui';

const shipments = [
  ['YT202607230018', '上海华光 / 138****6612', '上海 → 杭州', '¥ **,***', '运输中'],
  ['YT202607230017', '宁波远达 / 186****2098', '宁波 → 苏州', '¥ **,***', '待签收'],
  ['YT202607230016', '广州港链 / 139****7765', '广州 → 深圳', '¥ **,***', '已签收'],
  ['YT202607230015', '成都陆联 / 177****3502', '成都 → 重庆', '¥ **,***', '待调度'],
  ['YT202607230014', '杭州新航 / 151****0821', '杭州 → 南京', '¥ **,***', '运输中'],
] as const;

export function UserSimulationStep({
  onFinish,
  onClose,
  saving = false,
  error = '',
}: {
  onFinish: () => void | Promise<void>;
  onClose: () => void;
  saving?: boolean;
  error?: string;
}) {
  return (
    <section className="f08-simulation" role="dialog" aria-modal="true" aria-label="用户视角模拟">
      <header>
        <span className="f08-session-chip">SESSION</span>
        <strong>正在以 李明 / 运营管理员 的视角模拟</strong>
        <Button variant="secondary" onClick={onClose}>
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
            <p>权限基线 v19 · 字段策略已应用 · 仅展示李明可访问的数据</p>
          </div>
          <span>策略校验中</span>
        </div>
        <div className="f08-simulation-stats">
          <article>
            <small>可见运单</small>
            <strong>86</strong>
            <span>/ 128</span>
          </article>
          <article>
            <small>可编辑</small>
            <strong>42</strong>
            <span>受数据范围限制</span>
          </article>
          <article>
            <small>字段脱敏</small>
            <strong>3</strong>
            <span>手机号 · 金额 · 证件</span>
          </article>
        </div>
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
                {row.map((value, index) => (
                  <td key={index}>{value}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        <div className="f08-warning">
          模拟会话将在 14:32 自动结束；所有操作仅记录，不会写入业务数据。
        </div>
        {error ? (
          <div className="f08-save-error" role="alert">
            {error}
          </div>
        ) : null}
      </div>
    </section>
  );
}

export function SavedPolicyResult({ onClose }: { onClose: () => void }) {
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
      <p>权限 Diff、字段策略与用户模拟均通过，版本 v19 已生效。</p>
      <div className="f08-result-detail">生效范围：上海智立科技有限公司 · 12 名成员 · 9 个模块</div>
      <footer>
        <Button onClick={onClose}>完成</Button>
      </footer>
    </section>
  );
}
