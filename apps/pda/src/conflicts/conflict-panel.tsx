import { useState } from 'react';
import { Button } from '@zhili/ui';
import type { QueuedEvent } from '../domain/types';
import type { PdaSyncService } from '../sync/pda-sync-service';

const decisions = [
  { value: 'KEEP_SERVER', label: '保留服务器', impact: '放弃本地事件，保留服务器现状。' },
  {
    value: 'REAPPLY_LOCAL',
    label: '重新应用本地',
    impact: '由服务端按最新基线审计后重放；本地原事件完成，不在客户端重复入队。',
  },
  { value: 'SUBMIT_MANUAL', label: '提交人工', impact: '升级到人工处理与审计队列。' },
] as const;

export function ConflictPanel({
  event,
  service,
  onDone,
  canResolve,
  onUnauthorized,
}: {
  event: QueuedEvent;
  service: PdaSyncService;
  onDone: () => void;
  canResolve: boolean;
  onUnauthorized: (error: unknown) => Promise<void>;
}) {
  const [currentEvent, setCurrentEvent] = useState(event);
  const [resolution, setResolution] = useState<(typeof decisions)[number]['value']>('KEEP_SERVER');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    setError(undefined);
    try {
      await service.resolveConflict(currentEvent.envelope.eventId, resolution, reason);
      onDone();
    } catch (caught) {
      if (
        typeof caught === 'object' &&
        caught &&
        'status' in caught &&
        Number(caught.status) === 401
      )
        await onUnauthorized(caught);
      setCurrentEvent(service.getEvent(currentEvent.envelope.eventId) ?? currentEvent);
      setError(caught instanceof Error ? caught.message : '冲突处理失败');
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="pda-page" aria-labelledby="conflict-title">
      <div className="pda-page-heading">
        <div>
          <h1 id="conflict-title">同步冲突</h1>
          <p>决策提交前会再读取真实服务器快照和强 ETag。</p>
        </div>
      </div>
      <div className="pda-conflict-grid">
        <article>
          <h2>本地事件</h2>
          <dl>
            <dt>对象</dt>
            <dd>{currentEvent.envelope.entityRef}</dd>
            <dt>动作</dt>
            <dd>{currentEvent.envelope.action}</dd>
            <dt>基线</dt>
            <dd>{currentEvent.envelope.baseVersion}</dd>
            <dt>payload</dt>
            <dd>
              <code>{JSON.stringify(currentEvent.envelope.payload)}</code>
            </dd>
          </dl>
        </article>
        <article>
          <h2>服务器快照</h2>
          <p>
            <strong>serverVersion {currentEvent.conflict?.serverVersion}</strong> · conflict v
            {currentEvent.conflict?.version}
          </p>
          <code>{JSON.stringify(currentEvent.conflict?.serverState ?? {})}</code>
          {currentEvent.conflict?.snapshotNotice && (
            <p className="pda-message pda-message--warning">
              {currentEvent.conflict.snapshotNotice}
            </p>
          )}
        </article>
      </div>
      <section className="pda-diff-list">
        <h2>字段差异与影响</h2>
        {currentEvent.conflict?.differences?.map((difference) => (
          <div key={difference.field}>
            <strong>{difference.field}</strong>
            <span>
              本地 {difference.local} → 服务器 {difference.server}
            </span>
            <small>{difference.impact}</small>
          </div>
        ))}
      </section>
      <fieldset className="pda-decision-list">
        <legend>选择一个决策</legend>
        {decisions.map((decision) => (
          <label key={decision.value}>
            <input
              aria-label={decision.label}
              type="radio"
              name="resolution"
              value={decision.value}
              checked={resolution === decision.value}
              onChange={() => setResolution(decision.value)}
            />
            <span aria-hidden="true">
              <strong>{decision.label}</strong>
              <small>{decision.impact}</small>
            </span>
          </label>
        ))}
      </fieldset>
      <label className="pda-reason">
        处理原因
        <textarea
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          minLength={5}
        />
      </label>
      {error && (
        <div className="pda-message pda-message--danger" role="alert">
          {error}
        </div>
      )}
      {!canResolve && (
        <div className="pda-message pda-message--danger" role="alert">
          缺少 pda.conflict.resolve 权限，不允许提交决策。
        </div>
      )}
      <Button
        size="large"
        loading={busy}
        disabled={!canResolve || busy || Array.from(reason.trim()).length < 5}
        onClick={() => void submit()}
      >
        提交决策
      </Button>
    </section>
  );
}
