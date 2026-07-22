import type { DeviceSession, DeviceTask } from './types';

type DevicePermission = DeviceSession['permissions'][number];
type DeviceTaskType = DeviceTask['type'];

const WAREHOUSE_ACTIVE_STATUSES = ['READY', 'ASSIGNED', 'IN_PROGRESS'] as const;

export const DEVICE_TASK_ACTIONS = [
  {
    id: 'WAREHOUSE_RECEIVE',
    label: '扫码收货',
    group: '仓库',
    requiredPermission: 'pda.use',
    allowedTaskTypes: ['RECEIVE'],
    allowedStatuses: WAREHOUSE_ACTIVE_STATUSES,
    requiredFields: ['scannedCode'],
  },
  {
    id: 'REWEIGH',
    label: '复重',
    group: '仓库',
    requiredPermission: 'pda.use',
    allowedTaskTypes: ['RECEIVE'],
    allowedStatuses: WAREHOUSE_ACTIVE_STATUSES,
    requiredFields: ['scannedCode', 'weight'],
  },
  {
    id: 'MEASURE_DIMENSIONS',
    label: '量方',
    group: '仓库',
    requiredPermission: 'pda.use',
    allowedTaskTypes: ['RECEIVE'],
    allowedStatuses: WAREHOUSE_ACTIVE_STATUSES,
    requiredFields: ['scannedCode', 'length', 'width', 'height'],
  },
  {
    id: 'CAPTURE_RECEIPT_PHOTO',
    label: '收货拍照',
    group: '仓库',
    requiredPermission: 'pda.use',
    allowedTaskTypes: ['RECEIVE'],
    allowedStatuses: WAREHOUSE_ACTIVE_STATUSES,
    requiredFields: ['scannedCode', 'media'],
  },
  {
    id: 'PUTAWAY',
    label: '上架',
    group: '仓库',
    requiredPermission: 'pda.use',
    allowedTaskTypes: ['RECEIVE'],
    allowedStatuses: WAREHOUSE_ACTIVE_STATUSES,
    requiredFields: ['scannedCode', 'location'],
  },
  {
    id: 'INVENTORY_MOVE',
    label: '移库',
    group: '仓库',
    requiredPermission: 'pda.use',
    allowedTaskTypes: ['MOVE'],
    allowedStatuses: WAREHOUSE_ACTIVE_STATUSES,
    requiredFields: ['scannedCode', 'location'],
  },
  {
    id: 'SORT',
    label: '分货',
    group: '仓库',
    requiredPermission: 'pda.use',
    allowedTaskTypes: ['LOAD'],
    allowedStatuses: WAREHOUSE_ACTIVE_STATUSES,
    requiredFields: ['scannedCode', 'operationCode'],
  },
  {
    id: 'PICK',
    label: '拣货',
    group: '仓库',
    requiredPermission: 'pda.use',
    allowedTaskTypes: ['PICK'],
    allowedStatuses: WAREHOUSE_ACTIVE_STATUSES,
    requiredFields: ['scannedCode', 'operationCode', 'quantity'],
  },
  {
    id: 'BAG',
    label: '装袋',
    group: '仓库',
    requiredPermission: 'pda.use',
    allowedTaskTypes: ['LOAD'],
    allowedStatuses: WAREHOUSE_ACTIVE_STATUSES,
    requiredFields: ['scannedCode', 'operationCode'],
  },
  {
    id: 'PALLETIZE',
    label: '装托',
    group: '仓库',
    requiredPermission: 'pda.use',
    allowedTaskTypes: ['LOAD'],
    allowedStatuses: WAREHOUSE_ACTIVE_STATUSES,
    requiredFields: ['scannedCode', 'operationCode'],
  },
  {
    id: 'CONTAINERIZE',
    label: '装柜',
    group: '仓库',
    requiredPermission: 'pda.use',
    allowedTaskTypes: ['LOAD'],
    allowedStatuses: WAREHOUSE_ACTIVE_STATUSES,
    requiredFields: ['scannedCode', 'operationCode'],
  },
  {
    id: 'DISPATCH',
    label: '出库',
    group: '仓库',
    requiredPermission: 'pda.use',
    allowedTaskTypes: ['DISPATCH'],
    allowedStatuses: WAREHOUSE_ACTIVE_STATUSES,
    requiredFields: ['scannedCode', 'operationCode'],
  },
  {
    id: 'STOCKTAKE',
    label: '盘点',
    group: '仓库',
    requiredPermission: 'pda.use',
    allowedTaskTypes: ['STOCKTAKE'],
    allowedStatuses: WAREHOUSE_ACTIVE_STATUSES,
    requiredFields: ['scannedCode', 'count'],
  },
  {
    id: 'LAST_MILE_INTAKE',
    label: '尾程接货',
    group: '尾程',
    requiredPermission: 'lastmile.delivery.execute',
    allowedTaskTypes: ['LAST_MILE_DELIVERY'],
    allowedStatuses: ['PLANNED'],
    requiredFields: ['scannedCode', 'operationCode'],
  },
  {
    id: 'LAST_MILE_PALLETIZE',
    label: '尾程打托',
    group: '尾程',
    requiredPermission: 'lastmile.delivery.execute',
    allowedTaskTypes: ['LAST_MILE_DELIVERY'],
    allowedStatuses: ['PLANNED'],
    requiredFields: ['scannedCode', 'operationCode'],
    unavailableReason: '契约待扩展，当前禁止提交',
  },
  {
    id: 'LAST_MILE_LOAD',
    label: '尾程装车',
    group: '尾程',
    requiredPermission: 'lastmile.delivery.execute',
    allowedTaskTypes: ['LAST_MILE_DELIVERY'],
    allowedStatuses: ['PLANNED'],
    requiredFields: ['scannedCode', 'operationCode'],
  },
  {
    id: 'LAST_MILE_DELIVER',
    label: '派送',
    group: '尾程',
    requiredPermission: 'lastmile.delivery.execute',
    allowedTaskTypes: ['LAST_MILE_DELIVERY'],
    allowedStatuses: ['LOADED'],
    requiredFields: ['scannedCode'],
  },
  {
    id: 'LAST_MILE_EXCEPTION',
    label: '异常上报',
    group: '尾程',
    requiredPermission: 'lastmile.delivery.execute',
    allowedTaskTypes: ['LAST_MILE_DELIVERY'],
    allowedStatuses: ['PLANNED', 'LOADED', 'OUT_FOR_DELIVERY'],
    requiredFields: ['scannedCode', 'exceptionCode', 'note', 'media'],
  },
  {
    id: 'CAPTURE_POD',
    label: '签收 / POD',
    group: '尾程',
    requiredPermission: 'lastmile.pod.write',
    allowedTaskTypes: ['LAST_MILE_DELIVERY'],
    allowedStatuses: ['OUT_FOR_DELIVERY'],
    requiredFields: ['scannedCode', 'recipientName', 'signedAt', 'media'],
  },
] as const satisfies ReadonlyArray<{
  id: string;
  label: string;
  group: '仓库' | '尾程';
  requiredPermission: DevicePermission;
  allowedTaskTypes: readonly DeviceTaskType[];
  allowedStatuses: readonly string[];
  requiredFields: readonly string[];
  unavailableReason?: string;
}>;

export type DeviceTaskAction = (typeof DEVICE_TASK_ACTIONS)[number]['id'];
export type DeviceTaskActionDefinition = (typeof DEVICE_TASK_ACTIONS)[number];

export class TaskActionValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TaskActionValidationError';
  }
}

export function getTaskActionDefinition(action: DeviceTaskAction): DeviceTaskActionDefinition {
  return DEVICE_TASK_ACTIONS.find((candidate) => candidate.id === action)!;
}

export function taskActionSupportsTask(action: DeviceTaskAction, task: DeviceTask) {
  const definition = getTaskActionDefinition(action);
  return (
    (definition.allowedTaskTypes as readonly DeviceTaskType[]).includes(task.type) &&
    (definition.allowedStatuses as readonly string[]).includes(task.status)
  );
}

function requiredText(values: Record<string, string>, field: string, label: string) {
  const value = values[field]?.trim();
  if (!value) throw new TaskActionValidationError(`${label}不能为空，本地队列未写入。`);
  return value;
}

function positiveNumber(values: Record<string, string>, field: string, label: string) {
  const raw = requiredText(values, field, label);
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0)
    throw new TaskActionValidationError(`${label}必须是大于 0 的数字，本地队列未写入。`);
  return value;
}

function nonNegativeInteger(values: Record<string, string>, field: string, label: string) {
  const raw = requiredText(values, field, label);
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 0)
    throw new TaskActionValidationError(`${label}必须是大于等于 0 的整数，本地队列未写入。`);
  return value;
}

function positiveInteger(values: Record<string, string>, field: string, label: string) {
  const value = nonNegativeInteger(values, field, label);
  if (value === 0)
    throw new TaskActionValidationError(`${label}必须是大于 0 的整数，本地队列未写入。`);
  return value;
}

function optionalText(values: Record<string, string>, field: string) {
  return values[field]?.trim() || undefined;
}

function baseCode(values: Record<string, string>) {
  return requiredText(values, 'scannedCode', '扫描码 / 运单号');
}

export function buildTaskPayload(
  action: DeviceTaskAction,
  values: Record<string, string>
): Record<string, unknown> {
  const scannedCode = baseCode(values);
  if (action === 'WAREHOUSE_RECEIVE') {
    const weight = optionalText(values, 'weight');
    return weight
      ? { scannedCode, actualWeightKg: positiveNumber(values, 'weight', '实际重量') }
      : { scannedCode };
  }
  if (action === 'REWEIGH') return { actualWeightKg: positiveNumber(values, 'weight', '实际重量') };
  if (action === 'MEASURE_DIMENSIONS') {
    return {
      lengthCm: positiveNumber(values, 'length', '长度'),
      widthCm: positiveNumber(values, 'width', '宽度'),
      heightCm: positiveNumber(values, 'height', '高度'),
    };
  }
  if (action === 'CAPTURE_RECEIPT_PHOTO') return { scannedCode };
  if (action === 'PUTAWAY' || action === 'INVENTORY_MOVE')
    return { locationCode: requiredText(values, 'location', '目标库位') };
  if (action === 'STOCKTAKE')
    return { countedQuantity: nonNegativeInteger(values, 'count', '实盘数量') };
  if (action === 'SORT')
    return {
      parcelCode: scannedCode,
      destinationChuteCode: requiredText(values, 'operationCode', '目标滑槽码'),
    };
  if (action === 'PICK')
    return {
      parcelCode: scannedCode,
      sourceLocationCode: requiredText(values, 'operationCode', '来源库位码'),
      quantity: positiveInteger(values, 'quantity', '拣货数量'),
    };
  if (action === 'BAG')
    return {
      parcelCode: scannedCode,
      bagCode: requiredText(values, 'operationCode', '袋码'),
    };
  if (action === 'PALLETIZE')
    return {
      loadUnitCode: scannedCode,
      palletCode: requiredText(values, 'operationCode', '托盘码'),
    };
  if (action === 'CONTAINERIZE')
    return {
      loadUnitCode: scannedCode,
      containerCode: requiredText(values, 'operationCode', '柜码'),
    };
  if (action === 'DISPATCH')
    return {
      loadUnitCode: scannedCode,
      dispatchCode: requiredText(values, 'operationCode', '出库作业码'),
    };
  if (action === 'LAST_MILE_INTAKE')
    return {
      waybillCode: scannedCode,
      stationCode: requiredText(values, 'operationCode', '站点码'),
    };
  if (action === 'LAST_MILE_PALLETIZE')
    throw new TaskActionValidationError('尾程打托契约待扩展，当前禁止提交，本地队列未写入。');
  if (action === 'LAST_MILE_LOAD')
    return {
      deliveryTaskCode: scannedCode,
      vehicleCode: requiredText(values, 'operationCode', '车辆码'),
    };
  if (action === 'LAST_MILE_DELIVER')
    return { deliveryTaskCode: scannedCode, checkpoint: 'OUT_FOR_DELIVERY' };
  if (action === 'LAST_MILE_EXCEPTION') {
    const note = requiredText(values, 'note', '异常说明');
    if (Array.from(note).length < 2)
      throw new TaskActionValidationError('异常说明至少需要 2 个字符，本地队列未写入。');
    return {
      exceptionCode: requiredText(values, 'exceptionCode', '异常类型'),
      note,
    };
  }
  if (action === 'CAPTURE_POD') {
    const latitude = optionalText(values, 'latitude');
    const longitude = optionalText(values, 'longitude');
    if (Boolean(latitude) !== Boolean(longitude))
      throw new TaskActionValidationError('纬度和经度必须同时填写，本地队列未写入。');
    const signedAt = requiredText(values, 'signedAt', '签收时间');
    if (Number.isNaN(new Date(signedAt).getTime()))
      throw new TaskActionValidationError('签收时间格式无效，本地队列未写入。');
    const payload: Record<string, unknown> = {
      recipientName: requiredText(values, 'recipientName', '签收姓名'),
      signedAt,
    };
    if (latitude && longitude) {
      const parsedLatitude = Number(latitude);
      const parsedLongitude = Number(longitude);
      if (
        !Number.isFinite(parsedLatitude) ||
        !Number.isFinite(parsedLongitude) ||
        parsedLatitude < -90 ||
        parsedLatitude > 90 ||
        parsedLongitude < -180 ||
        parsedLongitude > 180
      )
        throw new TaskActionValidationError('定位坐标无效，本地队列未写入。');
      payload.latitude = parsedLatitude;
      payload.longitude = parsedLongitude;
    }
    const signature = optionalText(values, 'signature');
    const note = optionalText(values, 'note');
    if (signature) payload.signature = signature;
    if (note) payload.note = note;
    return payload;
  }
  action satisfies never;
  throw new TaskActionValidationError('未知作业动作，本地队列未写入。');
}

function taskMatchesSnapshot(current: DeviceTask, selected: DeviceTask) {
  return (
    current.id === selected.id &&
    current.reference === selected.reference &&
    current.type === selected.type &&
    current.status === selected.status &&
    current.version === selected.version
  );
}

export function actionUnavailableReason(
  action: DeviceTaskAction,
  task: DeviceTask | undefined,
  permissions: readonly string[]
) {
  const definition = getTaskActionDefinition(action);
  if ('unavailableReason' in definition) return definition.unavailableReason;
  if (!permissions.includes(definition.requiredPermission))
    return `缺少 ${definition.requiredPermission} 权限`;
  if (task && !(definition.allowedTaskTypes as readonly DeviceTaskType[]).includes(task.type))
    return `不适用于 ${task.type} 任务类型`;
  if (task && !(definition.allowedStatuses as readonly string[]).includes(task.status))
    return `任务状态 ${task.status} 不允许执行`;
  return undefined;
}

export function assertTaskActionAllowed(
  action: DeviceTaskAction,
  task: DeviceTask,
  permissions: readonly string[]
) {
  const definition = getTaskActionDefinition(action);
  if ('unavailableReason' in definition)
    throw new TaskActionValidationError(`${definition.unavailableReason}，本地队列未写入。`);
  if (!(definition.allowedTaskTypes as readonly DeviceTaskType[]).includes(task.type))
    throw new TaskActionValidationError(
      `${definition.label} 不适用于任务类型 ${task.type}，本地队列未写入。`
    );
  if (!(definition.allowedStatuses as readonly string[]).includes(task.status))
    throw new TaskActionValidationError(
      `${definition.label} 在任务状态 ${task.status} 下不可执行，本地队列未写入。`
    );
  if (!permissions.includes(definition.requiredPermission))
    throw new TaskActionValidationError(
      `缺少 ${definition.requiredPermission} 权限，本地队列未写入。`
    );
}

export function resolveTaskForAction(
  tasks: readonly DeviceTask[],
  action: DeviceTaskAction,
  reference: string,
  selectedTask?: DeviceTask
) {
  const normalizedReference = reference.trim();
  if (selectedTask) {
    const current = tasks.find((candidate) => candidate.id === selectedTask.id);
    if (!current || !taskMatchesSnapshot(current, selectedTask))
      throw new TaskActionValidationError(
        '选中任务的 id/reference/type/status/version 已变化，请返回任务首页刷新后重试。'
      );
    if (normalizedReference !== selectedTask.reference)
      throw new TaskActionValidationError('扫描码与选中任务 reference 不一致，本地队列未写入。');
    return current;
  }

  const compatible = tasks.filter(
    (candidate) =>
      candidate.reference === normalizedReference && taskActionSupportsTask(action, candidate)
  );
  if (compatible.length !== 1)
    throw new TaskActionValidationError(
      `手工扫描没有唯一匹配的 scoped task（匹配 ${compatible.length} 条），本地队列未写入。`
    );
  return compatible[0]!;
}
