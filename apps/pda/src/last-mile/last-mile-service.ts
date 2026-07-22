import type {
  DeliveryEvent,
  DeliveryTaskStatus,
  DeliveryTaskTransitionReceipt,
  ProofOfDelivery,
  ProofOfDeliveryCaptureReceipt,
  ProofOfDeliveryInput,
} from '../domain/types';
import type { PdaPort } from '../ports/pda-port';

export type DeliveryStatus = DeliveryTaskStatus;

export interface DeliveryTaskState {
  taskId: string;
  status: DeliveryStatus;
  version: number;
  pod?: ProofOfDelivery;
}

const allowed: Record<DeliveryStatus, DeliveryStatus[]> = {
  PLANNED: ['PALLETIZED', 'EXCEPTION'],
  PALLETIZED: ['LOADED', 'EXCEPTION'],
  LOADED: ['OUT_FOR_DELIVERY', 'EXCEPTION'],
  OUT_FOR_DELIVERY: ['COMPLETED', 'EXCEPTION'],
  COMPLETED: [],
  EXCEPTION: [],
};

function sameRefs(expected: string[], actual: string[]) {
  return (
    expected.length === actual.length &&
    new Set(expected).size === expected.length &&
    expected.every((ref) => actual.includes(ref))
  );
}

export class LastMileService {
  private state: DeliveryTaskState;

  constructor(
    private readonly port: PdaPort,
    initialState: DeliveryTaskState,
    private readonly now = () => new Date()
  ) {
    this.state = { ...initialState };
  }

  snapshot() {
    return { ...this.state };
  }

  async transition(
    deviceEventId: string,
    nextStatus: DeliveryStatus,
    scanEvidence: DeliveryEvent['scanEvidence'],
    mediaRefs: string[] = []
  ): Promise<DeliveryTaskTransitionReceipt> {
    const current = this.state;
    if (!allowed[current.status].includes(nextStatus)) {
      throw new Error(`非法尾程状态迁移：${current.status} → ${nextStatus}`);
    }
    const receipt = await this.port.updateDeliveryTaskStatus(
      current.taskId,
      `"${current.version}"`,
      `pda:delivery:${current.taskId}:${deviceEventId}:${nextStatus}`,
      {
        deviceEventId,
        targetStatus: nextStatus,
        occurredAt: this.now().toISOString(),
        mediaRefs,
        scanEvidence,
      }
    );
    if (
      receipt.deviceEventId !== deviceEventId ||
      receipt.deliveryTask.id !== current.taskId ||
      receipt.deliveryTask.status !== nextStatus ||
      !sameRefs(mediaRefs, receipt.claimedMediaRefs)
    ) {
      throw new Error('服务器尾程回执与本地事件、任务、状态或媒体认领不一致，已保留本地数据。');
    }
    this.state = {
      ...current,
      status: receipt.deliveryTask.status,
      version: receipt.deliveryTask.version,
    };
    return receipt;
  }

  async capturePod(
    input: ProofOfDeliveryInput,
    media: Array<{ mediaId: string; status: string }>
  ): Promise<ProofOfDeliveryCaptureReceipt> {
    if (this.state.status !== 'OUT_FOR_DELIVERY') {
      throw new Error(`非法 POD 状态：${this.state.status}，必须先进入派送中。`);
    }
    const reservedIds = new Set(
      media
        .filter((item) => ['UPLOADED', 'SCANNING', 'READY'].includes(item.status))
        .map((item) => item.mediaId)
    );
    if (input.evidenceRefs.length === 0 || input.evidenceRefs.some((id) => !reservedIds.has(id))) {
      throw new Error('POD 需要至少一份已上传且未被拒绝的照片或签名证据。');
    }
    const current = this.state;
    const receipt = await this.port.captureProofOfDelivery(
      current.taskId,
      `"${current.version}"`,
      `pda:pod:${current.taskId}:${input.deviceEventId}`,
      input
    );
    if (
      receipt.deviceEventId !== input.deviceEventId ||
      receipt.deliveryTask.id !== current.taskId ||
      receipt.deliveryTask.status !== 'COMPLETED' ||
      receipt.proofOfDelivery.deliveryTaskId !== current.taskId ||
      !sameRefs(input.evidenceRefs, receipt.claimedMediaRefs)
    ) {
      throw new Error('服务器 POD 回执与本地事件、任务或媒体认领不一致，已保留本地数据。');
    }
    this.state = {
      ...current,
      pod: receipt.proofOfDelivery,
      status: receipt.deliveryTask.status,
      version: receipt.deliveryTask.version,
    };
    return receipt;
  }
}
