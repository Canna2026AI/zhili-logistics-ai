import {
  DEVICE_TASK_ACTIONS,
  taskActionSupportsTask,
  type DeviceTaskAction,
} from '../domain/task-actions';
import type { DeviceTask } from '../domain/types';
import { f09Workflow } from '../workflows/f09-workflow';

export function compatibleTaskActions(task: DeviceTask) {
  return DEVICE_TASK_ACTIONS.filter((action) =>
    taskActionSupportsTask(action.id as DeviceTaskAction, task)
  );
}

export function presentTask(task: DeviceTask) {
  const actions = compatibleTaskActions(task);
  const workflow = actions[0] ? f09Workflow(actions[0].id as DeviceTaskAction) : undefined;
  return {
    title: workflow?.title ?? `任务 ${task.reference}`,
    nextStep: workflow?.primaryLabel,
    actions,
  };
}
