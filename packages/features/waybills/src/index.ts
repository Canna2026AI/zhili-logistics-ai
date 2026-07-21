export * from './adapters/api/waybill-api';
export * from './import/model/import';
export * from './import/ui/import-workbench';
export * from './order/model/order';
export * from './order/ui/order-draft-panel';
export * from './waybill/model/waybill';
export * from './waybill/ui/waybill-list';

export const featurePackage = {
  id: 'waybills',
  name: '订单、运单、包裹、品名与批量命令',
  status: 'implemented',
} as const;
