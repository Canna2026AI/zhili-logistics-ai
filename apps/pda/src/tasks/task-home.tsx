import { Box, MapPin, PackageCheck, Truck } from 'lucide-react';
import type { DeviceTask } from '../domain/types';

const typeLabel: Record<DeviceTask['type'], string> = {
  RECEIVE: '收货',
  MOVE: '移库',
  PICK: '拣货',
  LOAD: '装载',
  DISPATCH: '出库',
  LAST_MILE_DELIVERY: '尾程派送',
  STOCKTAKE: '盘点',
};

export function TaskHome({
  tasks,
  onScan,
}: {
  tasks: DeviceTask[];
  onScan: (task: DeviceTask) => void;
}) {
  return (
    <section className="pda-page" aria-labelledby="task-title">
      <div className="pda-page-heading">
        <div>
          <h1 id="task-title">任务首页</h1>
          <p>仅显示当前绑定仓库与用户范围内的任务。</p>
        </div>
        <span>{tasks.length} 项</span>
      </div>
      {tasks.length === 0 ? (
        <div className="pda-empty">
          <PackageCheck aria-hidden="true" />
          <strong>暂无待办任务</strong>
          <span>下拉或稍后刷新。</span>
        </div>
      ) : (
        <div className="pda-task-list">
          {tasks.map((task) => (
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
                <strong>{task.reference}</strong>
                <small>
                  {typeLabel[task.type]} · {task.status}
                </small>
              </span>
              <em data-priority={task.priority}>{task.priority}</em>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
