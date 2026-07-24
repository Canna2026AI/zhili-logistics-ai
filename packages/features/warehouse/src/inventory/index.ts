export interface InventoryMove {
  waybillNo: string;
  fromLocation: string;
  toLocation: string;
  quantity: number;
  expectedVersion: number;
}

export function validateInventoryMove(move: InventoryMove) {
  if (move.quantity <= 0) throw new Error('移库数量必须大于 0');
  if (move.fromLocation === move.toLocation) throw new Error('目标库位不能与原库位相同');
  return { ...move, auditEvent: 'warehouse.inventory.moved' as const };
}
