import type { ProofOfDelivery, ProofOfDeliveryInput } from '../domain/types';
import type { PdaPort } from '../ports/pda-port';

export type DeliveryStatus = 'PLANNED' | 'LOADED' | 'OUT_FOR_DELIVERY' | 'COMPLETED' | 'EXCEPTION';

export interface DeliveryTaskState {
  taskId: string;
  status: DeliveryStatus;
  version: number;
  pod?: ProofOfDelivery;
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

  async transition(nextStatus: DeliveryStatus, scanEvidence: Record<string, unknown>) {
    const current = this.state;
    const allowed: Record<DeliveryStatus, DeliveryStatus[]> = {
      PLANNED: ['LOADED', 'EXCEPTION'],
      LOADED: ['OUT_FOR_DELIVERY', 'EXCEPTION'],
      OUT_FOR_DELIVERY: ['COMPLETED', 'EXCEPTION'],
      COMPLETED: [],
      EXCEPTION: [],
    };
    if (!allowed[current.status].includes(nextStatus)) {
      throw new Error(`非法尾程状态迁移：${current.status} → ${nextStatus}`);
    }
    const receipt = await this.port.updateDeliveryTaskStatus(
      current.taskId,
      `"${current.version}"`,
      `pda:delivery:${current.taskId}:${current.version}:${nextStatus}`,
      {
        id: current.taskId,
        status: nextStatus,
        version: current.version,
        updatedAt: this.now().toISOString(),
        fromStatus: current.status,
        scanEvidence,
      }
    );
    this.state = { ...current, status: nextStatus, version: receipt.version };
    return this.snapshot();
  }

  async capturePod(input: ProofOfDeliveryInput, media: Array<{ mediaId: string; status: string }>) {
    if (this.state.status !== 'OUT_FOR_DELIVERY')
      throw new Error(`非法 POD 状态：${this.state.status}，必须先进入派送中。`);
    const readyIds = new Set(
      media.filter((item) => item.status === 'READY').map((item) => item.mediaId)
    );
    if (input.evidenceRefs.length === 0 || input.evidenceRefs.some((id) => !readyIds.has(id))) {
      throw new Error('POD 需要至少一份已 READY 的照片或签名证据。');
    }
    const current = this.state;
    const pod = await this.port.captureProofOfDelivery(
      current.taskId,
      `"${current.version}"`,
      `pda:pod:${current.taskId}:${current.version}:${input.signedAt}`,
      input
    );
    this.state = { ...current, pod, status: 'COMPLETED', version: current.version + 1 };
    return pod;
  }
}
