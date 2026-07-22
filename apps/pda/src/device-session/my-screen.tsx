import { useState } from 'react';
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
  onExport: (reason: string) => Promise<void>;
  exportAvailable: boolean;
}) {
  const [takeoverReason, setTakeoverReason] = useState('');
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
        {pendingCount > 0 && (
          <label className="pda-reason">
            管理员接管原因
            <textarea
              value={takeoverReason}
              minLength={5}
              placeholder="例如：设备损坏，由当班主管接管"
              onChange={(event) => setTakeoverReason(event.target.value)}
            />
          </label>
        )}
        <Button
          size="large"
          variant="secondary"
          disabled={!exportAvailable || Array.from(takeoverReason.trim()).length < 5}
          onClick={() => void onExport(takeoverReason)}
        >
          导出并由管理员接管
        </Button>
      </div>
      {pendingCount > 0 && (
        <div className="pda-message pda-message--warning">
          接管包将使用服务器短期 RSA 公钥和本机 AES-256-GCM 加密上传；只有 VERIFIED
          回执与作用域、双哈希完全一致时才清理本地密文并允许换仓。
        </div>
      )}
    </section>
  );
}
