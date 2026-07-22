export const DEVICE_TASK_ACTIONS = [
  { id: 'WAREHOUSE_RECEIVE', label: '扫码收货', group: '仓库' },
  { id: 'REWEIGH', label: '复重', group: '仓库' },
  { id: 'MEASURE_DIMENSIONS', label: '量方', group: '仓库' },
  { id: 'CAPTURE_RECEIPT_PHOTO', label: '收货拍照', group: '仓库' },
  { id: 'PUTAWAY', label: '上架', group: '仓库' },
  { id: 'INVENTORY_MOVE', label: '移库', group: '仓库' },
  { id: 'SORT', label: '分货', group: '仓库' },
  { id: 'PICK', label: '拣货', group: '仓库' },
  { id: 'BAG', label: '装袋', group: '仓库' },
  { id: 'PALLETIZE', label: '装托', group: '仓库' },
  { id: 'CONTAINERIZE', label: '装柜', group: '仓库' },
  { id: 'DISPATCH', label: '出库', group: '仓库' },
  { id: 'STOCKTAKE', label: '盘点', group: '仓库' },
  { id: 'LAST_MILE_INTAKE', label: '尾程接货', group: '尾程' },
  { id: 'LAST_MILE_PALLETIZE', label: '尾程打托', group: '尾程' },
  { id: 'LAST_MILE_LOAD', label: '尾程装车', group: '尾程' },
  { id: 'LAST_MILE_DELIVER', label: '派送', group: '尾程' },
  { id: 'LAST_MILE_EXCEPTION', label: '异常上报', group: '尾程' },
  { id: 'CAPTURE_POD', label: '签收 / POD', group: '尾程' },
] as const;

export type DeviceTaskAction = (typeof DEVICE_TASK_ACTIONS)[number]['id'];

export function buildTaskPayload(
  action: DeviceTaskAction,
  values: Record<string, string>
): Record<string, unknown> {
  if (action === 'MEASURE_DIMENSIONS') {
    return { lengthCm: values.length, widthCm: values.width, heightCm: values.height };
  }
  if (action === 'REWEIGH' || action === 'WAREHOUSE_RECEIVE') {
    return { actualWeightKg: values.weight || '123.50' };
  }
  if (action === 'PUTAWAY' || action === 'INVENTORY_MOVE') {
    return { locationCode: values.location || 'A-01-03' };
  }
  if (action === 'STOCKTAKE') return { countedQuantity: Number(values.count || 1) };
  if (action === 'SORT')
    return {
      parcelCode: values.scannedCode,
      destinationChuteCode: values.operationCode || 'CHUTE-PENDING',
    };
  if (action === 'PICK')
    return {
      parcelCode: values.scannedCode,
      sourceLocationCode: values.operationCode || 'TASK-ASSIGNED',
      quantity: 1,
    };
  if (action === 'BAG')
    return { parcelCode: values.scannedCode, bagCode: values.operationCode || values.scannedCode };
  if (action === 'PALLETIZE')
    return {
      loadUnitCode: values.scannedCode,
      palletCode: values.operationCode || values.scannedCode,
    };
  if (action === 'CONTAINERIZE')
    return {
      loadUnitCode: values.scannedCode,
      containerCode: values.operationCode || values.scannedCode,
    };
  if (action === 'DISPATCH')
    return {
      loadUnitCode: values.scannedCode,
      dispatchCode: values.operationCode || values.scannedCode,
    };
  if (action === 'LAST_MILE_INTAKE')
    return {
      waybillCode: values.scannedCode,
      stationCode: values.operationCode || 'BOUND-STATION',
    };
  if (action === 'LAST_MILE_LOAD')
    return {
      deliveryTaskCode: values.scannedCode,
      vehicleCode: values.operationCode || 'TASK-VEHICLE',
    };
  if (action === 'LAST_MILE_DELIVER')
    return { deliveryTaskCode: values.scannedCode, checkpoint: 'OUT_FOR_DELIVERY' };
  if (action === 'LAST_MILE_EXCEPTION') {
    return {
      exceptionCode: values.exceptionCode || 'RECIPIENT_UNAVAILABLE',
      note: values.note || '',
    };
  }
  if (action === 'CAPTURE_POD') {
    return {
      recipientName: values.recipientName,
      signedAt: values.signedAt,
      latitude: values.latitude ? Number(values.latitude) : undefined,
      longitude: values.longitude ? Number(values.longitude) : undefined,
      signature: values.signature,
      evidenceRefs: values.mediaId ? [values.mediaId] : [],
      note: values.note || '',
    };
  }
  return {
    scannedCode: values.scannedCode,
    loadUnitCode: values.loadUnitCode,
    note: values.note,
  };
}
