export type LoadUnitKind = 'BAG' | 'PALLET' | 'CONTAINER';

export interface DispatchPreflight {
  waybillCount: number;
  totalWeightKg: number;
  unresolvedIssueCount: number;
  missingChargeCount: number;
  printState: 'READY' | 'PENDING' | 'FAILED';
}

export function canDispatch(preflight: DispatchPreflight) {
  const blockers: string[] = [];
  if (preflight.waybillCount === 0) blockers.push('装载单没有运单');
  if (preflight.unresolvedIssueCount > 0)
    blockers.push(`${preflight.unresolvedIssueCount} 个问题件未关闭`);
  if (preflight.missingChargeCount > 0)
    blockers.push(`${preflight.missingChargeCount} 票费用不完整`);
  if (preflight.printState !== 'READY') blockers.push('交接文档未打印完成');
  return { allowed: blockers.length === 0, blockers };
}
