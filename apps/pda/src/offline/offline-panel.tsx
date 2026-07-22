import { useEffect, useState } from 'react';
import { Download, RefreshCw, TriangleAlert } from 'lucide-react';
import { Button, StatusTag } from '@zhili/ui';
import type { MediaQueueItem, QueuedEvent } from '../domain/types';

export function OfflinePanel({
  events,
  media,
  online,
  busy,
  message,
  onSync,
  onExport,
  onConflict,
  onRetry,
  canSync,
  canResolveConflict,
  exportAvailable,
  onRetryMedia,
  onDeleteWork,
}: {
  events: QueuedEvent[];
  media: MediaQueueItem[];
  online: boolean;
  busy: boolean;
  message?: string;
  onSync: () => Promise<void>;
  onExport: () => Promise<void>;
  onConflict: (eventId: string) => Promise<void>;
  onRetry: (eventId: string) => Promise<void>;
  canSync: boolean;
  canResolveConflict: boolean;
  exportAvailable: boolean;
  onRetryMedia: (mediaId: string) => Promise<void>;
  onDeleteWork: (eventId: string) => Promise<void>;
}) {
  const uploaded = media.filter((item) => item.remoteStatus === 'READY').length;
  return (
    <section className="pda-page" aria-labelledby="offline-title">
      <div className="pda-page-heading">
        <div>
          <h1 id="offline-title">离线队列</h1>
          <p>按本地序号同步；部分成功不回滚兄弟项。</p>
        </div>
        <span>{events.length}/200</span>
      </div>
      <div className="pda-sync-summary" role="status" aria-live="polite">
        <div>
          <strong>{online ? '在线' : '离线'}</strong>
          <span>{online ? '可以继续同步' : '业务事件已加密保留'}</span>
        </div>
        <div>
          <strong>
            {uploaded}/{media.length}
          </strong>
          <span>媒体 READY</span>
        </div>
      </div>
      {message && (
        <div className="pda-message pda-message--info" role="status">
          {message}
        </div>
      )}
      <div className="pda-command-row">
        <Button
          size="large"
          onClick={() => void onSync()}
          disabled={!online || busy || !canSync}
          loading={busy}
        >
          <RefreshCw aria-hidden="true" />
          立即同步
        </Button>
        <Button
          size="large"
          variant="secondary"
          disabled={!exportAvailable}
          onClick={() => void onExport()}
        >
          <Download aria-hidden="true" />
          导出接管
        </Button>
      </div>
      {!exportAvailable && (
        <div className="pda-message pda-message--warning" role="status">
          接管导出 PARTIAL：缺少服务器管理员授权/再认证契约，已 fail closed，禁止生成明文包。
        </div>
      )}
      <div className="pda-queue-list">
        {events.length === 0 && (
          <div className="pda-empty">
            <strong>队列已清空</strong>
            <span>没有未确认业务。</span>
          </div>
        )}
        {events.map((event) => (
          <article className="pda-queue-item" key={event.envelope.eventId}>
            <div>
              <strong>
                #{event.envelope.localSequence} · {event.envelope.entityRef}
              </strong>
              <span>
                {event.envelope.action} · baseVersion {event.envelope.baseVersion}
              </span>
            </div>
            <StatusTag tone={event.state === 'PENDING' ? 'warning' : 'danger'}>
              {event.state === 'PENDING'
                ? '待同步'
                : event.state === 'CONFLICT'
                  ? '冲突'
                  : '已拒绝'}
            </StatusTag>
            {event.state === 'CONFLICT' && (
              <button
                className="pda-row-command"
                disabled={!canResolveConflict}
                onClick={() => void onConflict(event.envelope.eventId)}
              >
                处理冲突
              </button>
            )}
            {event.state === 'REJECTED' && (
              <div className="pda-recovery">
                <TriangleAlert aria-hidden="true" />
                <p>
                  <strong>发生了什么：</strong>
                  {event.errorCode ?? '服务端拒绝'}
                  <br />
                  <strong>为什么：</strong>
                  {event.errorMessage ?? '状态或字段不符合契约'}
                  <br />
                  <strong>如何修复：</strong>核对任务状态后重试；接管导出契约完成前保持 fail
                  closed。
                  <br />
                  <strong>谁能处理：</strong>仓库主管 / pda.sync
                </p>
                <button onClick={() => void onRetry(event.envelope.eventId)}>修复后重试</button>
              </div>
            )}
          </article>
        ))}
      </div>
      {!canSync && (
        <div className="pda-message pda-message--danger" role="alert">
          缺少 pda.sync 权限，仅允许查看；管理员接管导出尚未开放。
        </div>
      )}
      {media.length > 0 && (
        <section className="pda-media-list">
          <h2>媒体补传</h2>
          {media.map((item) => (
            <MediaEvidence
              key={item.mediaId}
              item={item}
              online={online}
              onRetry={onRetryMedia}
              onDeleteWork={onDeleteWork}
            />
          ))}
        </section>
      )}
    </section>
  );
}

function MediaEvidence({
  item,
  online,
  onRetry,
  onDeleteWork,
}: {
  item: MediaQueueItem;
  online: boolean;
  onRetry: (mediaId: string) => Promise<void>;
  onDeleteWork: (eventId: string) => Promise<void>;
}) {
  const [url] = useState(() =>
    typeof URL.createObjectURL === 'function' ? URL.createObjectURL(item.blob) : undefined
  );
  useEffect(() => {
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [url]);
  return (
    <div className="pda-media-evidence">
      {url && <img src={url} alt={`待补传证据 ${item.mediaId}`} />}
      <span>{item.mediaId.slice(0, 18)}…</span>
      <progress value={item.progress} max="100">
        {item.progress}%
      </progress>
      <small>
        {item.remoteStatus ?? item.status} · 尝试 {item.attempts}
        {item.errorMessage ? ` · ${item.errorMessage}` : ''}
      </small>
      <div className="pda-media-commands">
        <button disabled={!online} onClick={() => void onRetry(item.mediaId)}>
          重试此媒体
        </button>
        <button onClick={() => void onDeleteWork(item.eventId)}>删除作业并重拍</button>
      </div>
    </div>
  );
}
