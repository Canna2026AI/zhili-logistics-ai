import { Box, MapPin, PackageCheck, Truck } from 'lucide-react';
import { Button } from '@zhili/ui';
import type { DeviceTask } from '../domain/types';
import type { LocalDeviceSession } from '../session/session-guard';
import { presentTask } from './task-presentation';

const typeLabel: Record<DeviceTask['type'], string> = {
  RECEIVE: '收货',
  MOVE: '移库',
  PICK: '拣货',
  LOAD: '装载',
  DISPATCH: '出库',
  LAST_MILE_DELIVERY: '尾程派送',
  STOCKTAKE: '盘点',
};

function formatLastSync(value: string | undefined, timeZone: string) {
  if (!value) return undefined;
  const timestamp = new Date(value);
  if (!Number.isFinite(timestamp.getTime())) return undefined;
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone,
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(timestamp);
}

export function TaskHome({
  tasks,
  session,
  onScan,
  onSwitchWarehouse,
  online = true,
  pendingCount = 0,
  lastSyncedAt,
}: {
  tasks: DeviceTask[];
  session: LocalDeviceSession;
  onScan: (task: DeviceTask) => void;
  onSwitchWarehouse?: () => void;
  online?: boolean;
  pendingCount?: number;
  lastSyncedAt?: string;
}) {
  const priorityTask =
    tasks.find((task) => task.priority === 'URGENT') ??
    tasks.find((task) => task.priority === 'HIGH') ??
    tasks[0];
  const receives = tasks.filter((task) => task.type === 'RECEIVE').length;
  const putaways = tasks.filter(
    (task) => task.type === 'RECEIVE' && ['READY', 'ASSIGNED', 'IN_PROGRESS'].includes(task.status)
  ).length;
  const lastMile = tasks.filter((task) => task.type === 'LAST_MILE_DELIVERY').length;
  const priorityPresentation = priorityTask ? presentTask(priorityTask) : undefined;
  const lastSync = formatLastSync(lastSyncedAt, session.timezone);

  return (
    <section className="pda-page" aria-labelledby="task-title">
      <h2 className="pda-sr-only">任务首页</h2>
      <div className="pda-page-heading pda-page-heading--stacked">
        <h1 id="task-title">今日任务</h1>
        <p>
          设备 {session.deviceId} · 仓库 {session.warehouseId} · 用户 {session.subjectId}
        </p>
      </div>
      <div className="pda-flow-summary">
        <strong>
          待收货 {receives} · 待上架 {putaways} · 尾程 {lastMile}
        </strong>
        <span>
          {[online ? '在线' : '离线', lastSync ? `上次同步 ${lastSync}` : undefined, `队列 ${pendingCount}/200`]
            .filter(Boolean)
            .join(' · ')}
        </span>
      </div>
      <div className="pda-flow-alert">
        <strong>设备与仓库已绑定</strong>
        <span>工作范围：收货、库内操作、尾程配送</span>
      </div>
      {tasks.length === 0 ? (
        <div className="pda-empty">
          <PackageCheck aria-hidden="true" />
          <strong>暂无待办任务</strong>
          <span>下拉或稍后刷新。</span>
        </div>
      ) : priorityTask ? (
        <>
          <article className="pda-primary-task">
            <strong>优先任务 · {priorityPresentation?.title}</strong>
            <div>
              <span>{priorityTask.reference}</span>
              <span>状态：{priorityTask.status}</span>
              {priorityPresentation?.nextStep && (
                <span>下一步：{priorityPresentation.nextStep}</span>
              )}
            </div>
            <small>任务版本 {priorityTask.version}</small>
          </article>
          <div className="pda-flow-actions">
            <Button size="large" onClick={() => onScan(priorityTask)}>
              开始任务
            </Button>
            <Button size="large" variant="secondary" onClick={onSwitchWarehouse}>
              切换仓库
            </Button>
          </div>
          <div className="pda-task-list" aria-label="全部任务">
          {tasks.map((task) => {
            const presentation = presentTask(task);
            return (
            <button key={task.id} className="pda-task-row" onClick={() => onScan(task)}>
              <span className="pda-task-icon">
                {task.type === 'LAST_MILE_DELIVERY' ? (
                  <Truck />
                ) : task.type === 'MOVE' ? (
                  <MapPin />
                ) : (
                  <Box />
                )}
              </span>
              <span>
                <strong>任务 {task.reference}</strong>
                <small>
                  {typeLabel[task.type]} · {task.status}
                </small>
                {presentation.actions.length > 0 && (
                  <small>{presentation.actions.map((action) => action.label).join(' · ')}</small>
                )}
              </span>
              <em data-priority={task.priority}>{task.priority}</em>
            </button>
            );
          })}
          </div>
        </>
      ) : (
        <div className="pda-empty">暂无待办任务</div>
      )}
    </section>
  );
}
