import { Button } from '@zhili/ui';
import type { LocalDeviceSession } from '../session/session-guard';

export function MyScreen({
  session,
  expired,
  pendingCount,
  onReauth,
  onExport,
  exportAvailable,
}: {
  session: LocalDeviceSession;
  expired: boolean;
  pendingCount: number;
  onReauth: () => void;
  onExport: () => Promise<void>;
  exportAvailable: boolean;
}) {
  return (
    <section className="pda-page" aria-labelledby="my-title">
      <div className="pda-page-heading">
        <div>
          <h1 id="my-title">我的设备</h1>
          <p>绑定与本地数据安全状态。</p>
        </div>
      </div>
      {expired && (
        <div className="pda-message pda-message--danger" role="alert">
          会话已过期，已停止新业务、同步和服务端写入。本地密文安全保留，请重新认证。
        </div>
      )}
      <dl className="pda-detail-list">
        <dt>设备</dt>
        <dd>{session.deviceId}</dd>
        <dt>仓库</dt>
        <dd>{session.warehouseId}</dd>
        <dt>用户</dt>
        <dd>{session.subjectId}</dd>
        <dt>到期</dt>
        <dd>{session.expiresAt}</dd>
        <dt>未同步</dt>
        <dd>{pendingCount}</dd>
      </dl>
      <div className="pda-command-stack">
        <Button size="large" onClick={onReauth}>
          重新认证
        </Button>
        <Button
          size="large"
          variant="secondary"
          disabled={!exportAvailable}
          onClick={() => void onExport()}
        >
          导出并由管理员接管
        </Button>
      </div>
      {pendingCount > 0 && (
        <div className="pda-message pda-message--warning">
          管理员接管尚缺服务器授权/再认证契约，当前保持 fail
          closed，不生成明文导出且不会清库换仓（PARTIAL）。
        </div>
      )}
    </section>
  );
}
