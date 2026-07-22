import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ClipboardList, Cloud, CloudOff, ScanLine, UserRound, WifiOff } from 'lucide-react';
import { createZhiliClient } from '@zhili/api-client';
import { Button } from '@zhili/ui';
import type { DeviceTask } from './domain/types';
import { createApiPdaPort } from './ports/api-pda-port';
import { MemoryPdaPort } from './ports/memory-pda-port';
import type { PdaPort } from './ports/pda-port';
import { IndexedDbQueueStore, type QueueStore } from './offline/queue-store';
import { OfflineQueue } from './offline/offline-queue';
import { MediaQueue } from './offline/media-queue';
import {
  SessionGuard,
  UnsafeBindingChangeError,
  type LocalDeviceSession,
} from './session/session-guard';
import { PdaSyncService } from './sync/pda-sync-service';
import { LoginScreen, type BindingInput } from './device-session/login-screen';
import { TaskHome } from './tasks/task-home';
import { ScannerScreen } from './scanner/scanner-screen';
import { OfflinePanel } from './offline/offline-panel';
import { ConflictPanel } from './conflicts/conflict-panel';
import { MyScreen } from './device-session/my-screen';
import {
  DeviceTakeoverService,
  type TakeoverProgressStage,
} from './device-session/takeover-service';

type Tab = 'tasks' | 'scan' | 'offline' | 'my' | 'conflict';

const appVersion = '0.2.0';
const timezone = 'Asia/Shanghai';

function defaultPort() {
  const explicitMock =
    import.meta.env.DEV && new URLSearchParams(window.location.search).get('mock') === '1';
  return explicitMock
    ? new MemoryPdaPort()
    : createApiPdaPort(createZhiliClient({ baseUrl: '/api/v1' }));
}

function explain(error: unknown) {
  const status = apiStatus(error);
  const detail = error instanceof Error ? error.message : '未知错误';
  const server = error as { remediation?: string; requestId?: string } | undefined;
  const remedy: Record<number, string> = {
    401: '会话已失效；本地数据已保留，请重新认证。',
    403: '缺少当前动作权限或数据范围，请联系仓库主管。',
    409: '服务器版本已变更，请刷新冲突快照后重试。',
    413: '批次或媒体过大，请拆分批次或重拍。',
    422: '字段或状态不可执行，请按服务器 remediation 修正。',
  };
  return `发生了什么：${detail}。为什么：请求未被确认。如何修复：${server?.remediation ?? remedy[status] ?? '检查网络后重试，队列不会被清除。'}谁能处理：仓库主管 / 系统管理员。requestId：${server?.requestId ?? '本地失败，尚无服务端 requestId'}。`;
}

function apiStatus(error: unknown) {
  return typeof error === 'object' && error && 'status' in error ? Number(error.status) : 0;
}

export function App({
  store: injectedStore,
  port: injectedPort,
}: { store?: QueueStore; port?: PdaPort } = {}) {
  const store = useMemo(() => injectedStore ?? new IndexedDbQueueStore(), [injectedStore]);
  const port = useMemo(() => injectedPort ?? defaultPort(), [injectedPort]);
  const queue = useMemo(() => new OfflineQueue(store), [store]);
  const media = useMemo(() => new MediaQueue(store), [store]);
  const guard = useMemo(() => new SessionGuard(queue), [queue]);
  const syncService = useMemo(() => new PdaSyncService(queue, media, port), [queue, media, port]);
  const [takeoverStage, setTakeoverStage] = useState<TakeoverProgressStage>();
  const takeoverService = useMemo(
    () => new DeviceTakeoverService(queue, media, port, undefined, setTakeoverStage),
    [queue, media, port]
  );

  const [phase, setPhase] = useState<'loading' | 'login' | 'ready'>('loading');
  const [session, setSession] = useState<LocalDeviceSession>();
  const [tasks, setTasks] = useState<DeviceTask[]>([]);
  const [tab, setTab] = useState<Tab>('tasks');
  const [scanCode, setScanCode] = useState('');
  const [selectedTask, setSelectedTask] = useState<DeviceTask>();
  const [revision, setRevision] = useState(0);
  const [online, setOnline] = useState(() => navigator.onLine);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [syncMessage, setSyncMessage] = useState<string>();
  const [selectedConflictId, setSelectedConflictId] = useState<string>();
  const [bindingMismatchLocked, setBindingMismatchLocked] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<string>();
  const [restoredFromStorage, setRestoredFromStorage] = useState(false);

  const changed = () => setRevision((value) => value + 1);
  const snapshot = queue.snapshot();
  const mediaItems = session ? media.snapshot(session) : media.snapshot();
  const selectedConflict = snapshot.events.find(
    (event) => event.envelope.eventId === selectedConflictId
  );
  const replaceTasks = async (next: DeviceTask[]) => {
    await queue.setMeta('device-tasks', next);
    setTasks(next);
    setSelectedTask((current) =>
      current ? next.find((task) => task.id === current.id) : undefined
    );
  };

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [restoredQueue, restoredMedia, restoredSyncAt] = await Promise.all([
          queue.restore(),
          media.restore(),
          queue.getMeta<string>('last-successful-sync-at'),
        ]);
        setRestoredFromStorage(restoredQueue.events.length > 0 || restoredMedia.length > 0);
        setLastSyncedAt(restoredSyncAt);
        const restored = await guard.restoreSession();
        if (cancelled) return;
        if (!restored) {
          setPhase('login');
          changed();
          return;
        }
        const contextMismatch =
          queue
            .snapshot()
            .events.some(
              (event) =>
                event.envelope.deviceId !== restored.deviceId ||
                event.envelope.tenantId !== restored.tenantId ||
                event.envelope.warehouseId !== restored.warehouseId ||
                event.envelope.subjectId !== restored.subjectId
            ) ||
          media
            .snapshot()
            .some(
              (item) =>
                !item.context ||
                item.context.deviceId !== restored.deviceId ||
                item.context.tenantId !== restored.tenantId ||
                item.context.warehouseId !== restored.warehouseId ||
                item.context.subjectId !== restored.subjectId
            );
        if (contextMismatch) {
          setError(
            '本地队列与已绑定 tenant/subject/device/warehouse 不匹配，已 fail closed，仅允许重新认证原绑定。'
          );
          setSession(restored);
          setPhase('ready');
          setTab('my');
          setBindingMismatchLocked(true);
          changed();
          return;
        }
        setSession(restored);
        try {
          const finalized = await takeoverService.retryPendingFinalize(restored);
          if (finalized) {
            setSyncMessage(
              `已恢复接管本地提交：${finalized.exportId}。未重复上传密文。`
            );
          }
        } catch (caught) {
          setSyncMessage(explain(caught));
        }
        const cachedTasks = await queue.getMeta<DeviceTask[]>('device-tasks');
        if (!navigator.onLine && cachedTasks) setTasks(cachedTasks);
        else {
          const loadedTasks = await port.getDeviceTasks(restored.deviceId);
          setTasks(loadedTasks);
          await queue.setMeta('device-tasks', loadedTasks);
        }
        setPhase('ready');
        changed();
      } catch (caught) {
        if (!cancelled) {
          setError(explain(caught));
          setPhase('login');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [guard, media, port, queue, takeoverService]);

  useEffect(() => {
    const onlineHandler = () => setOnline(true);
    const offlineHandler = () => setOnline(false);
    window.addEventListener('online', onlineHandler);
    window.addEventListener('offline', offlineHandler);
    return () => {
      window.removeEventListener('online', onlineHandler);
      window.removeEventListener('offline', offlineHandler);
    };
  }, []);

  const bind = async (input: BindingInput) => {
    setBusy(true);
    setError(undefined);
    try {
      const current = guard.current();
      const switching =
        current &&
        (current.deviceId !== input.deviceId ||
          current.warehouseId !== input.warehouseId ||
          current.subjectId !== input.subjectId);
      if (
        switching &&
        (queue.snapshot().events.length > 0 ||
          media.snapshot().some((item) => item.remoteStatus !== 'READY'))
      )
        throw new UnsafeBindingChangeError();
      const bound = await port.bindDevice(
        input.deviceId,
        {
          warehouseId: input.warehouseId,
          subjectId: input.subjectId,
          deviceCode: input.deviceCode,
        },
        `pda:bind:${input.deviceId}:${input.warehouseId}:${input.subjectId}`
      );
      if (
        current &&
        bound.tenantId !== current.tenantId &&
        (queue.snapshot().events.length > 0 ||
          media.snapshot().some((item) => item.remoteStatus !== 'READY'))
      )
        throw new UnsafeBindingChangeError();
      const next: LocalDeviceSession = { ...bound, timezone, appVersion };
      await guard.persistSession(next);
      setSession(next);
      setBindingMismatchLocked(false);
      const loadedTasks = await port.getDeviceTasks(next.deviceId);
      setTasks(loadedTasks);
      setSelectedTask(undefined);
      await queue.setMeta('device-tasks', loadedTasks);
      setPhase('ready');
      setTab('tasks');
      changed();
    } catch (caught) {
      setError(explain(caught));
    } finally {
      setBusy(false);
    }
  };

  const synchronize = async () => {
    if (!session || !online) return;
    if (!session.permissions.includes('pda.sync')) {
      setSyncMessage('缺少 pda.sync 权限，仅允许查看；管理员接管需要独立权限。');
      return;
    }
    setBusy(true);
    setSyncMessage(undefined);
    try {
      guard.assertAllowed('SYNC');
      const result = await syncService.synchronize(session);
      if (result.authoritativeTasks) {
        setTasks(result.authoritativeTasks);
        setSelectedTask((current) =>
          current ? result.authoritativeTasks?.find((task) => task.id === current.id) : undefined
        );
      }
      setSyncMessage(
        `同步完成：应用 ${result.applied}，已处理 ${result.duplicate}，冲突 ${result.conflict}，拒绝 ${result.rejected}，媒体已预留 ${result.mediaReserved}。`
      );
      const syncedAt = new Date().toISOString();
      await queue.setMeta('last-successful-sync-at', syncedAt);
      setLastSyncedAt(syncedAt);
      changed();
    } catch (caught) {
      if (apiStatus(caught) === 401) {
        await guard.invalidate('API 401 during sync');
        setError(explain(caught));
        setPhase('login');
      } else {
        const persistedTasks = await queue
          .getMeta<DeviceTask[]>('device-tasks')
          .catch(() => undefined);
        if (persistedTasks) {
          setTasks(persistedTasks);
          setSelectedTask((current) =>
            current ? persistedTasks.find((task) => task.id === current.id) : undefined
          );
        }
        setSyncMessage(explain(caught));
        changed();
      }
    } finally {
      setBusy(false);
    }
  };

  const exportQueue = async (reason: string) => {
    if (!session || !online) {
      setSyncMessage('管理员接管需要联网取得服务器短期授权，本地数据保持不变。');
      return;
    }
    setBusy(true);
    setSyncMessage(undefined);
    setTakeoverStage(undefined);
    try {
      guard.assertAllowed('EXPORT');
      const receipt = await takeoverService.exportAndClear(session, reason);
      setSyncMessage(
        `接管导出已验证：${receipt.exportId}。本地事件与媒体已原子清理，可以重新认证换仓。`
      );
      changed();
    } catch (caught) {
      if (apiStatus(caught) === 401) {
        await guard.invalidate('API 401 during takeover export');
        setError(explain(caught));
        setPhase('login');
      } else setSyncMessage(explain(caught));
    } finally {
      setBusy(false);
    }
  };

  const openConflict = async (eventId: string) => {
    if (!session?.permissions.includes('pda.conflict.resolve')) {
      setSyncMessage('缺少 pda.conflict.resolve 权限。');
      return;
    }
    setBusy(true);
    setSyncMessage(undefined);
    try {
      guard.assertAllowed('SYNC');
      await syncService.loadConflict(eventId);
      setSelectedConflictId(eventId);
      setTab('conflict');
      changed();
    } catch (caught) {
      setSyncMessage(explain(caught));
    } finally {
      setBusy(false);
    }
  };

  if (phase === 'loading')
    return (
      <main className="pda-loading" role="status">
        正在恢复加密离线数据…
      </main>
    );
  if (phase === 'login' || !session)
    return (
      <LoginScreen busy={busy} error={error} pendingCount={snapshot.events.length} onBind={bind} />
    );

  if (bindingMismatchLocked) {
    return (
      <main className="pda-login-shell">
        <section className="pda-login-card" aria-labelledby="binding-lock-title">
          <div className="pda-brand-mark" aria-hidden="true">
            ZL
          </div>
          <h1 id="binding-lock-title">本地数据范围不匹配</h1>
          <div className="pda-message pda-message--danger" role="alert">
            检测到其他 tenant / subject / device / warehouse 的事件或媒体。本应用已 fail
            closed：任务、扫描、同步和冲突入口全部停用。
          </div>
          <Button
            size="large"
            onClick={() => {
              setPhase('login');
              setError(undefined);
            }}
          >
            重新认证原绑定
          </Button>
          <p className="pda-form-note">
            请重新认证本地事件所属的原绑定；随后可使用服务器授权的加密管理员接管流程。
          </p>
        </section>
      </main>
    );
  }

  const expired = guard.isExpired();
  const headerMediaReserved = mediaItems.filter((item) =>
    ['UPLOADED', 'SCANNING', 'READY'].includes(item.remoteStatus ?? '')
  ).length;
  return (
    <main className="pda-app" data-revision={revision}>
      <header className="pda-topbar">
        <button
          type="button"
          className="pda-topbar-back"
          aria-label="返回任务"
          onClick={() => setTab('tasks')}
        >
          <ChevronLeft aria-hidden="true" />
        </button>
        <strong className="pda-topbar-title">智立科技物流AI系统</strong>
        <div className="pda-network" role="status" aria-live="polite" data-online={online}>
          {online ? <Cloud aria-hidden="true" /> : <CloudOff aria-hidden="true" />}
          <span>
            {online ? '在线' : '离线'} ·{' '}
            <b data-testid="pending-count">{snapshot.events.length}</b>/200
            <br />
            媒体 {headerMediaReserved}/{mediaItems.length}
          </span>
        </div>
      </header>
      {expired && (
        <div className="pda-session-banner" role="alert">
          <WifiOff aria-hidden="true" />
          会话已过期：已停止新业务命令，本地数据安全保留。
          <button
            onClick={() => {
              setPhase('login');
              setError(undefined);
            }}
          >
            重新认证
          </button>
        </div>
      )}
      {snapshot.warning && (
        <div className="pda-capacity-banner" role="alert">
          待同步队列接近上限（{snapshot.events.length}/200）；满队列后仅允许同步和重新认证。
        </div>
      )}
      {error && (
        <div className="pda-message pda-message--danger pda-global-error" role="alert">
          {error}
        </div>
      )}
      <div className="pda-content">
        {tab === 'tasks' && (
          <TaskHome
            session={session}
            tasks={tasks}
            online={online}
            pendingCount={snapshot.events.length}
            lastSyncedAt={lastSyncedAt}
            onSwitchWarehouse={() => {
              setPhase('login');
              setError(undefined);
            }}
            onScan={(task) => {
              setSelectedTask(task);
              setScanCode(task.reference);
              setTab('scan');
            }}
          />
        )}
        {tab === 'scan' && (
          <ScannerScreen
            key={selectedTask?.id ?? 'manual-scan'}
            session={session}
            queue={queue}
            media={media}
            port={port}
            online={online}
            tasks={tasks}
            selectedTask={selectedTask}
            initialCode={scanCode}
            assertBusinessAllowed={() => guard.assertAllowed('NEW_BUSINESS_EVENT')}
            onChanged={changed}
            onUnauthorized={async (caught) => {
              await guard.invalidate('API 401 during business command');
              setError(explain(caught));
              setPhase('login');
            }}
            onTaskUpdated={async (taskId, status, version) => {
              await replaceTasks(
                tasks.map((task) => (task.id === taskId ? { ...task, status, version } : task))
              );
            }}
            onTasksRefreshed={replaceTasks}
          />
        )}
        {tab === 'offline' && (
          <OfflinePanel
            events={snapshot.events}
            media={mediaItems}
            online={online}
            busy={busy}
            message={syncMessage}
            canSync={session.permissions.includes('pda.sync')}
            canResolveConflict={session.permissions.includes('pda.conflict.resolve')}
            onSync={synchronize}
            onExport={exportQueue}
            exportAvailable={
              online &&
              !busy &&
              snapshot.events.length > 0 &&
              session.permissions.includes('pda.takeover.export')
            }
            onRetryMedia={async (mediaId) => {
              guard.assertAllowed('SYNC');
              await media.uploadRefs(session, [mediaId], (item) =>
                port.uploadDeviceMedia(
                  session.deviceId,
                  {
                    eventId: item.eventId,
                    mediaId: item.mediaId,
                    contentHash: item.contentHash,
                    file: item.blob,
                  },
                  `pda:media:${item.mediaId}:${item.contentHash}`
                )
              );
              changed();
            }}
            onDeleteWork={async (eventId) => {
              await queue.deleteWork(eventId);
              await media.restore();
              changed();
              setTab('scan');
            }}
            onConflict={openConflict}
            onRetry={async (eventId) => {
              await queue.retryRejected(eventId);
              changed();
            }}
            takeoverStage={takeoverStage}
            restoredFromStorage={restoredFromStorage}
          />
        )}
        {tab === 'conflict' && selectedConflict && (
          <ConflictPanel
            event={selectedConflict}
            service={syncService}
            canResolve={session.permissions.includes('pda.conflict.resolve')}
            onUnauthorized={async (caught) => {
              await guard.invalidate('API 401 during conflict resolution');
              setError(explain(caught));
              setPhase('login');
            }}
            onDone={() => {
              changed();
              setTab('offline');
            }}
          />
        )}
        {tab === 'my' && (
          <MyScreen
            session={session}
            expired={expired}
            pendingCount={snapshot.events.length}
            onReauth={() => {
              setPhase('login');
              setError(undefined);
            }}
            onExport={exportQueue}
            exportAvailable={
              online &&
              !busy &&
              snapshot.events.length > 0 &&
              session.permissions.includes('pda.takeover.export')
            }
            takeoverStage={takeoverStage}
          />
        )}
      </div>
      <nav className="pda-bottom-nav" aria-label="PDA 主导航">
        {(
          [
            ['tasks', '任务', ClipboardList],
            ['scan', '扫描', ScanLine],
            ['offline', '离线', CloudOff],
            ['my', '我的', UserRound],
          ] as const
        ).map(([id, label, Icon]) => (
          <button
            key={id}
            aria-current={tab === id ? 'page' : undefined}
            onClick={() => {
              if (id === 'scan') {
                setSelectedTask(undefined);
                setScanCode('');
              }
              setTab(id);
            }}
          >
            <Icon aria-hidden="true" />
            <span>{label}</span>
            {id === 'offline' && snapshot.events.length > 0 && (
              <b aria-hidden="true">{snapshot.events.length}</b>
            )}
          </button>
        ))}
      </nav>
    </main>
  );
}
