import { useEffect, useState, type ChangeEvent, type KeyboardEvent } from 'react';
import { Camera, ScanLine } from 'lucide-react';
import { Button } from '@zhili/ui';
import {
  DEVICE_TASK_ACTIONS,
  actionUnavailableReason,
  assertTaskActionAllowed,
  buildTaskPayload,
  resolveTaskForAction,
  taskActionSupportsTask,
  type DeviceTaskAction,
} from '../domain/task-actions';
import type { LocalDeviceSession } from '../session/session-guard';
import type { OfflineQueue } from '../offline/offline-queue';
import type { MediaQueue } from '../offline/media-queue';
import type { PdaPort } from '../ports/pda-port';
import type { DeviceTask } from '../domain/types';
import { LastMileService, type DeliveryStatus } from '../last-mile/last-mile-service';

type BarcodeResult = { rawValue: string };
type BarcodeDetectorConstructor = new (options?: { formats?: string[] }) => {
  detect(source: ImageBitmapSource): Promise<BarcodeResult[]>;
};

function eventId() {
  return `01J${crypto.randomUUID().replaceAll('-', '').slice(0, 23).toUpperCase()}`.slice(0, 26);
}

function feedbackPulse() {
  navigator.vibrate?.(35);
  try {
    const AudioContextClass = window.AudioContext;
    if (!AudioContextClass) return;
    const audio = new AudioContextClass();
    const oscillator = audio.createOscillator();
    const gain = audio.createGain();
    oscillator.frequency.value = 880;
    gain.gain.value = 0.035;
    oscillator.connect(gain).connect(audio.destination);
    oscillator.start();
    oscillator.stop(audio.currentTime + 0.06);
    oscillator.addEventListener('ended', () => void audio.close(), { once: true });
  } catch {
    /* vibration + live text remain available */
  }
}

function isoDateTime(value: string) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString();
}

function initialActionForTask(task: DeviceTask | undefined, permissions: readonly string[]) {
  const compatible = DEVICE_TASK_ACTIONS.filter(
    (candidate) => !task || taskActionSupportsTask(candidate.id, task)
  );
  return (
    compatible.find((candidate) => !actionUnavailableReason(candidate.id, task, permissions)) ??
    compatible[0] ??
    DEVICE_TASK_ACTIONS[0]
  ).id;
}

function canonicalDeliveryStatus(value: string): DeliveryStatus {
  if (
    value === 'PLANNED' ||
    value === 'LOADED' ||
    value === 'OUT_FOR_DELIVERY' ||
    value === 'COMPLETED' ||
    value === 'EXCEPTION'
  )
    return value;
  throw new Error(`服务端任务状态 ${value} 不在尾程 canonical states 中，已停止执行。`);
}

function transitionStatus(action: DeviceTaskAction): DeliveryStatus {
  if (action === 'LAST_MILE_LOAD') return 'LOADED';
  if (action === 'LAST_MILE_DELIVER') return 'OUT_FOR_DELIVERY';
  if (action === 'LAST_MILE_EXCEPTION') return 'EXCEPTION';
  throw new Error(`动作 ${action} 不是尾程状态迁移动作，已停止执行。`);
}

export function ScannerScreen({
  session,
  queue,
  media,
  port,
  online,
  tasks,
  selectedTask,
  initialCode,
  assertBusinessAllowed,
  onChanged,
  onTaskUpdated,
  onUnauthorized,
}: {
  session: LocalDeviceSession;
  queue: OfflineQueue;
  media: MediaQueue;
  port: PdaPort;
  online: boolean;
  tasks: DeviceTask[];
  selectedTask?: DeviceTask;
  initialCode: string;
  assertBusinessAllowed: () => void;
  onChanged: () => void;
  onTaskUpdated: (taskId: string, status: string, version: number) => void;
  onUnauthorized: (error: unknown) => Promise<void>;
}) {
  const [action, setAction] = useState<DeviceTaskAction>(() =>
    initialActionForTask(selectedTask, session.permissions)
  );
  const [code, setCode] = useState(initialCode);
  const [values, setValues] = useState<Record<string, string>>({});
  const [file, setFile] = useState<File>();
  const [message, setMessage] = useState('等待扫描');
  const [tone, setTone] = useState<'neutral' | 'queued' | 'success' | 'danger'>('neutral');
  const [cameraError, setCameraError] = useState<string>();
  const [locationError, setLocationError] = useState<string>();
  const [busy, setBusy] = useState(false);

  const update = (key: string, value: string) =>
    setValues((current) => ({ ...current, [key]: value }));

  const unavailableReason = actionUnavailableReason(action, selectedTask, session.permissions);

  const submit = async (overrideCode?: string) => {
    const entityRef = (overrideCode ?? code).trim();
    if (busy) return;
    setBusy(true);
    try {
      if (!entityRef) throw new Error('扫描码 / 运单号不能为空，本地队列未写入。');
      assertBusinessAllowed();
      const resourceTask = resolveTaskForAction(tasks, action, entityRef, selectedTask);
      assertTaskActionAllowed(action, resourceTask, session.permissions);
      if (
        (action === 'CAPTURE_RECEIPT_PHOTO' ||
          action === 'CAPTURE_POD' ||
          action === 'LAST_MILE_EXCEPTION') &&
        !file
      )
        throw new Error('此动作要求拍照或签名证据，请先采集图片。');
      const payload = buildTaskPayload(action, { ...values, scannedCode: entityRef });
      const id = eventId();
      const mediaRefs: string[] = [];
      const mediaItems = [];
      if (file) {
        const item = await media.prepare(session, id, file, file.type);
        mediaRefs.push(item.mediaId);
        mediaItems.push(item);
      }

      const deliveryAction = [
        'LAST_MILE_LOAD',
        'LAST_MILE_DELIVER',
        'LAST_MILE_EXCEPTION',
      ].includes(action);
      const deliveryTask = resourceTask.type === 'LAST_MILE_DELIVERY' ? resourceTask : undefined;
      const outcome = await queue.enqueue(session, {
        eventId: id,
        action,
        entityRef,
        payload: { ...payload, mediaRefs, taskId: resourceTask.id },
        mediaRefs,
        mediaItems,
        baseVersion: resourceTask.version,
      });
      await media.restore();
      if (outcome.enqueueDisposition === 'DUPLICATE') {
        setTone('neutral');
        setMessage(`#${outcome.envelope.localSequence} · ${entityRef} 已在本地队列，未重复写入`);
        feedbackPulse();
        onChanged();
        return;
      }
      if (online && deliveryAction && deliveryTask) {
        if (mediaRefs.length > 0) {
          await media.uploadRefs(session, mediaRefs, (item) =>
            port.uploadDeviceMedia(
              session.deviceId,
              {
                eventId: item.eventId,
                mediaId: item.mediaId,
                contentHash: item.contentHash,
                file: item.blob,
              },
              `pda:media:${item.mediaId}:${item.contentHash}`
            )
          );
          if (action === 'LAST_MILE_EXCEPTION' && !media.areReady(mediaRefs))
            throw new Error('异常证据尚未 READY，状态未推进，媒体已保留待补传。');
        }
        const service = new LastMileService(port, {
          taskId: deliveryTask.id,
          status: canonicalDeliveryStatus(deliveryTask.status),
          version: deliveryTask.version,
        });
        const updated = await service.transition(transitionStatus(action), {
          ...payload,
          scannedCode: entityRef,
          mediaRefs,
        });
        onTaskUpdated(updated.taskId, updated.status, updated.version);
        await queue.applySyncResults([
          {
            eventId: outcome.envelope.eventId,
            disposition: 'APPLIED',
            serverVersion: updated.version,
          },
        ]);
        setTone('success');
        setMessage(
          `${entityRef} · 服务端已确认 ${DEVICE_TASK_ACTIONS.find((item) => item.id === action)?.label}`
        );
      } else if (online && action === 'CAPTURE_POD' && deliveryTask && mediaRefs.length > 0) {
        await media.uploadRefs(session, mediaRefs, (item) =>
          port.uploadDeviceMedia(
            session.deviceId,
            {
              eventId: item.eventId,
              mediaId: item.mediaId,
              contentHash: item.contentHash,
              file: item.blob,
            },
            `pda:media:${item.mediaId}:${item.contentHash}`
          )
        );
        const item = media
          .snapshot(session)
          .find((candidate) => candidate.mediaId === mediaRefs[0]);
        if (!item || item.remoteStatus !== 'READY')
          throw new Error(
            `POD 证据尚未 READY（${item?.remoteStatus ?? item?.status ?? 'MISSING'}），已保留待补传。`
          );
        const service = new LastMileService(port, {
          taskId: deliveryTask.id,
          status: canonicalDeliveryStatus(deliveryTask.status),
          version: deliveryTask.version,
        });
        await service.capturePod(
          {
            recipientName: values.recipientName,
            signedAt: isoDateTime(values.signedAt),
            latitude: values.latitude ? Number(values.latitude) : undefined,
            longitude: values.longitude ? Number(values.longitude) : undefined,
            evidenceRefs: mediaRefs,
            note: values.note,
          },
          [{ mediaId: item.mediaId, status: item.remoteStatus }]
        );
        const updated = service.snapshot();
        onTaskUpdated(updated.taskId, updated.status, updated.version);
        await queue.applySyncResults([
          {
            eventId: outcome.envelope.eventId,
            disposition: 'APPLIED',
            serverVersion: updated.version,
          },
        ]);
        setTone('success');
        setMessage(`${entityRef} · POD 已由服务端创建不可变版本`);
      } else {
        setTone('queued');
        setMessage(`#${outcome.envelope.localSequence} · ${entityRef} · 已本地排队`);
      }
      feedbackPulse();
      onChanged();
    } catch (error) {
      if (typeof error === 'object' && error && 'status' in error && Number(error.status) === 401)
        await onUnauthorized(error);
      setTone('danger');
      setMessage(error instanceof Error ? error.message : '扫描处理失败');
      onChanged();
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    const receive = (event: Event) => {
      const value = (event as CustomEvent<string>).detail;
      if (value) {
        setCode(value);
        void submit(value);
      }
    };
    window.addEventListener('pda:scan', receive);
    return () => window.removeEventListener('pda:scan', receive);
  });

  const keydown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      void submit();
    }
  };

  const openCamera = async () => {
    let stream: MediaStream | undefined;
    try {
      const Detector = (window as unknown as { BarcodeDetector?: BarcodeDetectorConstructor })
        .BarcodeDetector;
      if (!window.isSecureContext || !Detector || !navigator.mediaDevices?.getUserMedia)
        throw new Error('当前环境不支持安全相机条码识别');
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      const video = document.createElement('video');
      video.srcObject = stream;
      await video.play();
      const detected = await new Detector({ formats: ['qr_code', 'code_128'] }).detect(video);
      if (detected[0]?.rawValue) {
        setCode(detected[0].rawValue);
        await submit(detected[0].rawValue);
      } else throw new Error('未识别到条码');
    } catch (error) {
      setCameraError(
        `相机不可用，已降级为拍照文件/扫码枪/手工输入。${error instanceof Error ? ` ${error.message}` : ''}`
      );
    } finally {
      stream?.getTracks().forEach((track) => track.stop());
    }
  };

  const chooseFile = (event: ChangeEvent<HTMLInputElement>) => setFile(event.target.files?.[0]);

  const locate = () => {
    setLocationError(undefined);
    if (!navigator.geolocation) {
      setLocationError('设备不支持定位，POD 可继续使用照片证据。');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        update('latitude', String(position.coords.latitude));
        update('longitude', String(position.coords.longitude));
      },
      (error) =>
        setLocationError(`定位未授权或不可用（${error.message}），已降级为无位置的照片签收。`),
      { enableHighAccuracy: true, timeout: 8_000 }
    );
  };

  return (
    <section className="pda-page pda-scan-page" aria-labelledby="scan-title">
      <div className="pda-page-heading">
        <div>
          <h1 id="scan-title">扫描与作业</h1>
          <p>扫码枪 Enter、广播、相机与手工输入共用同一入队逻辑。</p>
        </div>
      </div>
      {selectedTask && (
        <div className="pda-selected-task" data-testid="selected-task">
          <strong>{selectedTask.reference}</strong>
          <span>
            {selectedTask.type} · {selectedTask.status} · v{selectedTask.version}
          </span>
          <small>{selectedTask.id}</small>
        </div>
      )}
      <div className="pda-form pda-operation-form">
        <label>
          作业动作
          <select
            value={action}
            onChange={(event) => setAction(event.target.value as DeviceTaskAction)}
          >
            {DEVICE_TASK_ACTIONS.map((item) => {
              const reason = actionUnavailableReason(item.id, selectedTask, session.permissions);
              return (
                <option key={item.id} value={item.id} disabled={Boolean(reason)}>
                  {item.label}
                  {reason ? `（${item.id === 'LAST_MILE_PALLETIZE' ? '契约待扩展' : reason}）` : ''}
                </option>
              );
            })}
          </select>
        </label>
        <label>
          扫描码 / 运单号
          <div className="pda-scan-input">
            <ScanLine aria-hidden="true" />
            <input
              value={code}
              onChange={(event) => setCode(event.target.value)}
              onKeyDown={keydown}
              autoComplete="off"
            />
          </div>
        </label>
        {(action === 'REWEIGH' || action === 'WAREHOUSE_RECEIVE') && (
          <label>
            实际重量 kg
            <input
              inputMode="decimal"
              value={values.weight ?? ''}
              onChange={(event) => update('weight', event.target.value)}
            />
          </label>
        )}
        {action === 'MEASURE_DIMENSIONS' && (
          <div className="pda-inline-fields">
            <label>
              长 cm
              <input
                inputMode="decimal"
                onChange={(event) => update('length', event.target.value)}
              />
            </label>
            <label>
              宽 cm
              <input
                inputMode="decimal"
                onChange={(event) => update('width', event.target.value)}
              />
            </label>
            <label>
              高 cm
              <input
                inputMode="decimal"
                onChange={(event) => update('height', event.target.value)}
              />
            </label>
          </div>
        )}
        {(action === 'PUTAWAY' || action === 'INVENTORY_MOVE') && (
          <label>
            目标库位
            <input
              value={values.location ?? ''}
              onChange={(event) => update('location', event.target.value)}
            />
          </label>
        )}
        {[
          'SORT',
          'PICK',
          'BAG',
          'PALLETIZE',
          'CONTAINERIZE',
          'DISPATCH',
          'LAST_MILE_INTAKE',
          'LAST_MILE_LOAD',
        ].includes(action) && (
          <label>
            {action === 'SORT'
              ? '目标滑槽码'
              : action === 'PICK'
                ? '来源库位码'
                : action === 'BAG'
                  ? '袋码'
                  : action === 'PALLETIZE'
                    ? '托盘码'
                    : action === 'CONTAINERIZE'
                      ? '柜码'
                      : action === 'DISPATCH'
                        ? '出库作业码'
                        : action === 'LAST_MILE_INTAKE'
                          ? '站点码'
                          : action === 'LAST_MILE_LOAD'
                            ? '车辆码'
                            : '目标容器 / 作业码'}
            <input
              value={values.operationCode ?? ''}
              onChange={(event) => update('operationCode', event.target.value)}
            />
          </label>
        )}
        {action === 'PICK' && (
          <label>
            拣货数量
            <input
              type="number"
              min="1"
              value={values.quantity ?? ''}
              onChange={(event) => update('quantity', event.target.value)}
            />
          </label>
        )}
        {action === 'STOCKTAKE' && (
          <label>
            实盘数量
            <input
              type="number"
              min="0"
              value={values.count ?? ''}
              onChange={(event) => update('count', event.target.value)}
            />
          </label>
        )}
        {action === 'LAST_MILE_EXCEPTION' && (
          <>
            <label>
              异常类型
              <select
                value={values.exceptionCode ?? ''}
                onChange={(event) => update('exceptionCode', event.target.value)}
              >
                <option value="">请选择</option>
                <option value="RECIPIENT_UNAVAILABLE">收件人不在</option>
                <option value="ADDRESS_INVALID">地址错误</option>
                <option value="DAMAGED">破损</option>
              </select>
            </label>
            <label>
              异常说明
              <textarea
                value={values.note ?? ''}
                onChange={(event) => update('note', event.target.value)}
              />
            </label>
          </>
        )}
        {action === 'CAPTURE_POD' && (
          <>
            <label>
              签收姓名
              <input
                value={values.recipientName ?? ''}
                onChange={(event) => update('recipientName', event.target.value)}
              />
            </label>
            <label>
              签收时间
              <input
                type="datetime-local"
                value={values.signedAt ?? ''}
                onChange={(event) => update('signedAt', event.target.value)}
              />
            </label>
            <div className="pda-inline-fields">
              <label>
                纬度
                <input
                  inputMode="decimal"
                  value={values.latitude ?? ''}
                  onChange={(event) => update('latitude', event.target.value)}
                />
              </label>
              <label>
                经度
                <input
                  inputMode="decimal"
                  value={values.longitude ?? ''}
                  onChange={(event) => update('longitude', event.target.value)}
                />
              </label>
            </div>
            <Button variant="secondary" onClick={locate} disabled={Boolean(unavailableReason)}>
              获取当前位置（可选）
            </Button>
            {locationError && (
              <div className="pda-message pda-message--warning" role="status">
                {locationError}
              </div>
            )}
            <label>
              签名痕迹
              <textarea
                placeholder="可输入签名备注；照片为必需证据"
                value={values.signature ?? ''}
                onChange={(event) => update('signature', event.target.value)}
              />
            </label>
          </>
        )}
        <div className="pda-media-row">
          <Button
            variant="secondary"
            onClick={() => void openCamera()}
            disabled={Boolean(unavailableReason)}
          >
            <Camera aria-hidden="true" />
            打开相机扫码
          </Button>
          <label className="pda-file-button" aria-disabled={Boolean(unavailableReason)}>
            拍照或选择图片
            <input
              type="file"
              accept="image/*"
              capture="environment"
              onChange={chooseFile}
              disabled={Boolean(unavailableReason)}
            />
          </label>
        </div>
        {file && (
          <div className="pda-file-state">
            <span>{file.name}</span>
            <button onClick={() => setFile(undefined)}>删除/重拍</button>
          </div>
        )}
        {cameraError && (
          <div className="pda-message pda-message--warning" role="alert">
            {cameraError}
          </div>
        )}
        {unavailableReason && (
          <div className="pda-message pda-message--danger" role="alert">
            {unavailableReason}，此动作不可提交，本地队列不会写入。
          </div>
        )}
        <Button
          size="large"
          onClick={() => void submit()}
          loading={busy}
          disabled={busy || queue.snapshot().full || Boolean(unavailableReason)}
        >
          确认作业
        </Button>
      </div>
      <div
        className="pda-scan-feedback"
        data-tone={tone}
        role={tone === 'danger' ? 'alert' : 'status'}
        aria-live="assertive"
      >
        <strong>{message}</strong>
        <span>
          {tone === 'queued'
            ? '未伪装为服务端成功；同步后会逐条确认。'
            : '反馈包含文字、颜色与触感。'}
        </span>
      </div>
    </section>
  );
}
