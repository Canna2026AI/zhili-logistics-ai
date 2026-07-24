// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { QueuedEvent } from '../domain/types';
import { OfflinePanel } from './offline-panel';

function pendingEvent(sequence: number): QueuedEvent {
  return {
    state: 'PENDING',
    envelope: {
      eventId: `01JOFFLINE${String(sequence).padStart(16, '0')}`,
      deviceId: '01JDEVICE00000000000000003',
      localSequence: sequence,
      tenantId: '01JTENANT0000000000000001',
      warehouseId: '01JWAREHOUSE00000000000001',
      subjectId: '01JSUBJECT0000000000000001',
      action: 'WAREHOUSE_RECEIVE',
      entityRef: `S-${sequence}`,
      payload: {},
      mediaRefs: [],
      baseVersion: 7,
      idempotencyKey: `pda:test:${sequence}`,
      occurredAt: '2026-07-23T01:00:00.000Z',
      timezone: 'Asia/Shanghai',
      appVersion: '0.2.0',
    },
  };
}

describe('OfflinePanel F09 states', () => {
  afterEach(cleanup);

  it('renders the warning and restart-recovery state from the restored queue', () => {
    render(
      <OfflinePanel
        events={Array.from({ length: 183 }, (_, index) => pendingEvent(index + 1))}
        media={[]}
        online={false}
        busy={false}
        restoredFromStorage
        canSync
        canResolveConflict
        exportAvailable={false}
        onSync={async () => undefined}
        onExport={async () => undefined}
        onConflict={async () => undefined}
        onRetry={async () => undefined}
        onRetryMedia={async () => undefined}
        onDeleteWork={async () => undefined}
      />
    );

    expect(screen.getByRole('heading', { name: '离线队列预警' })).toBeVisible();
    expect(screen.getByText(/容量 183\/200/)).toBeVisible();
    expect(screen.getByText(/本地队列已恢复/)).toBeVisible();
  });

  it('does not label newly queued current-run work as restored from startup storage', () => {
    render(
      <OfflinePanel
        events={[pendingEvent(1)]}
        media={[]}
        online={false}
        busy={false}
        restoredFromStorage={false}
        canSync
        canResolveConflict
        exportAvailable={false}
        onSync={async () => undefined}
        onExport={async () => undefined}
        onConflict={async () => undefined}
        onRetry={async () => undefined}
        onRetryMedia={async () => undefined}
        onDeleteWork={async () => undefined}
      />
    );

    expect(screen.queryByText(/本地队列已恢复/)).not.toBeInTheDocument();
  });

  it('renders the server-authorized takeover stage without implying business success', () => {
    render(
      <OfflinePanel
        events={[pendingEvent(1)]}
        media={[]}
        online
        busy
        takeoverStage="AUTHORIZED"
        canSync
        canResolveConflict
        exportAvailable={false}
        onSync={async () => undefined}
        onExport={async () => undefined}
        onConflict={async () => undefined}
        onRetry={async () => undefined}
        onRetryMedia={async () => undefined}
        onDeleteWork={async () => undefined}
      />
    );

    expect(screen.getByRole('heading', { name: '管理员接管授权' })).toBeVisible();
    expect(screen.getByText(/RSA-OAEP-256/)).toBeVisible();
    expect(screen.getByText(/尚未清理本地数据/)).toBeVisible();
  });
});
