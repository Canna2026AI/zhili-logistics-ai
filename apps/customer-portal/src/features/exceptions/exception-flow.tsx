import { useRef, useState } from 'react';
import { Button } from '@zhili/ui';
import { createCustomerIdempotencyKey, CustomerApiError, customerPort } from '../../api';
import type { CustomerExceptionRecord } from '../../customer-records';
import { SummaryItem, SummaryList, WorkflowShell, type WorkflowTone } from '../workflow-shell';

type ExceptionStep = 'list' | 'detail' | 'upload' | 'partial' | 'failed' | 'resolved';
type ExceptionSession = {
  schemaVersion: 1;
  issueId: string;
  failedNotificationIds: string[];
};
type ExceptionOperationIntent = {
  schemaVersion: 1;
  resource: string;
  idempotencyKey: string;
};

function readExceptionSession(key: string, records: CustomerExceptionRecord[]) {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key) ?? 'null');
    if (
      typeof value === 'object' &&
      value !== null &&
      (value as { schemaVersion?: unknown }).schemaVersion === 1 &&
      typeof (value as { issueId?: unknown }).issueId === 'string' &&
      records.some((record) => record.id === (value as { issueId: string }).issueId) &&
      Array.isArray((value as { failedNotificationIds?: unknown }).failedNotificationIds) &&
      (value as { failedNotificationIds: unknown[] }).failedNotificationIds.length > 0 &&
      (value as { failedNotificationIds: unknown[] }).failedNotificationIds.every(
        (id) => typeof id === 'string' && id.length > 0
      ) &&
      new Set((value as { failedNotificationIds: string[] }).failedNotificationIds).size ===
        (value as { failedNotificationIds: string[] }).failedNotificationIds.length
    )
      return value as ExceptionSession;
  } catch {
    // Invalid state is removed below.
  }
  localStorage.removeItem(key);
  return null;
}

const meta: Record<
  ExceptionStep,
  { title: string; description: string; active: number; tone: WorkflowTone; status: string }
> = {
  list: {
    title: '待处理物流异常',
    description: '按 SLA 与影响范围排序。',
    active: 0,
    tone: 'warning',
    status: '正常 · 4 个异常等待客户处理',
  },
  detail: {
    title: '收件地址无法定位',
    description: '承运商需要补充园区入口与联系人信息。',
    active: 1,
    tone: 'warning',
    status: '待处理 · SLA 剩余 01:26:18',
  },
  upload: {
    title: '提交异常处理资料',
    description: '支持图片、PDF 与现场联系人信息。',
    active: 2,
    tone: 'info',
    status: '正常 · 文件将进行病毒扫描',
  },
  partial: {
    title: '资料已提交，通知部分失败',
    description: '异常单已更新，不影响承运商继续处理。',
    active: 3,
    tone: 'warning',
    status: 'PARTIAL · 3 / 4 个通知渠道成功',
  },
  failed: {
    title: '资料暂未提交',
    description: '附件校验失败，已保留文字信息。',
    active: 2,
    tone: 'danger',
    status: '失败 · 未向承运商发送任何资料',
  },
  resolved: {
    title: '异常已恢复流转',
    description: '承运商确认收到入口信息并重新派送。',
    active: 3,
    tone: 'success',
    status: '成功 · 异常已关闭',
  },
};

export function ExceptionFlow({
  notify,
  records,
  storageKey,
  mockMode = false,
}: {
  notify: (message: string) => void;
  records: CustomerExceptionRecord[];
  storageKey: string;
  mockMode?: boolean;
}) {
  const [restored] = useState(() => readExceptionSession(storageKey, records));
  const [step, setStep] = useState<ExceptionStep>(() => (restored ? 'partial' : 'list'));
  const [selected, setSelected] = useState(
    () => records.find((record) => record.id === restored?.issueId) ?? records[0]!
  );
  const [file, setFile] = useState<File | null>(null);
  const [contact, setContact] = useState(() => records[0]?.contact ?? '');
  const [note, setNote] = useState(() => records[0]?.note ?? '');
  const [failedNotificationIds, setFailedNotificationIds] = useState<string[]>(
    () => restored?.failedNotificationIds ?? []
  );
  const [retryComplete, setRetryComplete] = useState(false);
  const [busy, setBusy] = useState(false);
  const pendingRef = useRef(new Set<'evidence' | 'retry'>());
  const evidenceOperationKey = `${storageKey}:evidence`;
  const retryOperationKey = `${storageKey}:retry`;
  const current =
    step === 'list'
      ? meta.list
      : { ...meta[step], title: step === 'detail' ? selected.title : meta[step].title };

  const stableIntent = (key: string, resource: string): ExceptionOperationIntent => {
    try {
      const stored: unknown = JSON.parse(localStorage.getItem(key) ?? 'null');
      if (
        typeof stored === 'object' &&
        stored !== null &&
        (stored as { schemaVersion?: unknown }).schemaVersion === 1 &&
        (stored as { resource?: unknown }).resource === resource &&
        typeof (stored as { idempotencyKey?: unknown }).idempotencyKey === 'string' &&
        /^f1c-[A-Za-z0-9-]{8,200}$/.test((stored as { idempotencyKey: string }).idempotencyKey)
      )
        return stored as ExceptionOperationIntent;
    } catch {
      localStorage.removeItem(key);
    }
    const intent: ExceptionOperationIntent = {
      schemaVersion: 1,
      resource,
      idempotencyKey: createCustomerIdempotencyKey(),
    };
    localStorage.setItem(key, JSON.stringify(intent));
    return intent;
  };

  const operationMatches = (key: string, expected: ExceptionOperationIntent) => {
    try {
      const value: unknown = JSON.parse(localStorage.getItem(key) ?? 'null');
      return (
        typeof value === 'object' &&
        value !== null &&
        (value as { schemaVersion?: unknown }).schemaVersion === expected.schemaVersion &&
        (value as { resource?: unknown }).resource === expected.resource &&
        (value as { idempotencyKey?: unknown }).idempotencyKey === expected.idempotencyKey
      );
    } catch {
      return false;
    }
  };

  const clearOperation = (key: string, expected: ExceptionOperationIntent) => {
    if (!operationMatches(key, expected)) return false;
    localStorage.removeItem(key);
    return true;
  };

  const selectRecord = (record: CustomerExceptionRecord) => {
    setSelected(record);
    setContact(record.contact);
    setNote(record.note);
    setFile(null);
    setFailedNotificationIds([]);
    setRetryComplete(false);
    setStep('detail');
  };

  const submitEvidence = async () => {
    if (!file || pendingRef.current.has('evidence')) return;
    pendingRef.current.add('evidence');
    const resource = `${selected.id}:${file.name}:${file.size}:${file.type}:${file.lastModified}`;
    const operation = stableIntent(evidenceOperationKey, resource);
    setBusy(true);
    try {
      const result = await customerPort.submitIssueEvidence(
        selected.id,
        { file, contact, note },
        operation.idempotencyKey
      );
      const failedIds = result.failedNotificationIds;
      const hasValidFailedIds =
        Array.isArray(failedIds) &&
        failedIds.every((id) => typeof id === 'string' && id.trim().length > 0) &&
        new Set(failedIds).size === failedIds.length;
      const validResult =
        result.issueId === selected.id &&
        Number.isSafeInteger(result.version) &&
        result.version >= 1 &&
        hasValidFailedIds &&
        ((result.status === 'PARTIAL' && failedIds.length > 0) ||
          (result.status === 'SUCCEEDED' && failedIds.length === 0));
      if (!validResult) throw new Error('服务端通知回执不一致，未进入可重试状态。');
      if (!clearOperation(evidenceOperationKey, operation)) return;
      setFailedNotificationIds(failedIds);
      if (failedIds.length > 0)
        localStorage.setItem(
          storageKey,
          JSON.stringify({
            schemaVersion: 1,
            issueId: selected.id,
            failedNotificationIds: failedIds,
          })
        );
      else localStorage.removeItem(storageKey);
      setRetryComplete(false);
      setStep(result.status === 'PARTIAL' ? 'partial' : 'resolved');
      notify(
        result.status === 'PARTIAL'
          ? `异常资料已保存；${failedIds.length} 个通知项待重试，工单不回滚。`
          : '异常资料与通知已全部提交。'
      );
    } catch (error) {
      if (!operationMatches(evidenceOperationKey, operation)) return;
      if (error instanceof CustomerApiError && error.status >= 400 && error.status < 500)
        clearOperation(evidenceOperationKey, operation);
      setFailedNotificationIds([]);
      setRetryComplete(false);
      notify(error instanceof Error ? error.message : '资料提交失败。');
      setStep('failed');
    } finally {
      pendingRef.current.delete('evidence');
      setBusy(false);
    }
  };

  const retryFailed = async () => {
    if (failedNotificationIds.length === 0 || pendingRef.current.has('retry')) {
      notify('没有可重试的服务端失败项。');
      return;
    }
    pendingRef.current.add('retry');
    const resource = `${selected.id}:${[...failedNotificationIds].sort().join(',')}`;
    const operation = stableIntent(retryOperationKey, resource);
    setBusy(true);
    try {
      const result = await customerPort.retryFailedNotifications(
        failedNotificationIds,
        operation.idempotencyKey
      );
      const returnedIds = result.items.map((item) => item.id);
      const expected = [...failedNotificationIds].sort();
      const returned = [...returnedIds].sort();
      if (
        result.items.some((item) => item.status !== 'SUCCEEDED') ||
        returned.length !== expected.length ||
        returned.some((id, index) => id !== expected[index])
      )
        throw new Error('重试回执与服务端失败项不一致，状态未标记为送达。');
      if (!clearOperation(retryOperationKey, operation)) return;
      setRetryComplete(true);
      localStorage.removeItem(storageKey);
      notify(`仅重试失败通知：${failedNotificationIds.join('、')} 已送达。`);
    } catch (error) {
      if (!operationMatches(retryOperationKey, operation)) return;
      if (error instanceof CustomerApiError && error.status >= 400 && error.status < 500)
        clearOperation(retryOperationKey, operation);
      notify(error instanceof Error ? error.message : '失败通知重试未完成。');
    } finally {
      pendingRef.current.delete('retry');
      setBusy(false);
    }
  };

  return (
    <WorkflowShell
      code="F03 · 异常中心"
      title={current.title}
      description={current.description}
      steps={['异常列表', '核验详情', '补充资料', '处理完成']}
      activeStep={current.active}
      panelTitle={step === 'list' ? '优先处理' : step === 'partial' ? '通知通道' : '异常资料'}
      status={
        step === 'partial'
          ? `PARTIAL · ${failedNotificationIds.length} 个通知渠道待重试`
          : current.status
      }
      tone={current.tone}
      summaryTitle={step === 'partial' ? '数据结果' : 'SLA 与处理结果'}
      summary={
        <SummaryList>
          {step === 'partial' ? (
            <>
              <SummaryItem label="异常资料" value="已保存" />
              <SummaryItem label="工单状态" value="处理中" />
              <SummaryItem label="失败通知项" value={failedNotificationIds.join('、')} />
            </>
          ) : (
            <>
              <SummaryItem label="异常单号" value={selected.exceptionNo} />
              <SummaryItem label="关联运单" value={selected.waybillNo} />
              <SummaryItem label="审计编号" value={selected.auditNo} />
            </>
          )}
        </SummaryList>
      }
      actions={
        <>
          {step === 'list' ? (
            <Button onClick={() => selectRecord(selected)}>查看详情</Button>
          ) : null}
          {step === 'detail' ? <Button onClick={() => setStep('upload')}>补充资料</Button> : null}
          {step === 'upload' ? (
            <>
              {mockMode ? (
                <Button variant="secondary" onClick={() => setStep('failed')}>
                  模拟上传失败
                </Button>
              ) : null}
              <Button disabled={!file || busy} onClick={() => void submitEvidence()}>
                {busy ? '提交中…' : '提交资料'}
              </Button>
            </>
          ) : null}
          {step === 'partial' ? (
            <>
              <Button
                variant="secondary"
                disabled={busy || retryComplete}
                onClick={() => void retryFailed()}
              >
                仅重试失败通知
              </Button>
              <Button onClick={() => setStep('resolved')}>继续处理</Button>
            </>
          ) : null}
          {step === 'failed' ? <Button onClick={() => setStep('upload')}>重新上传</Button> : null}
          {step === 'resolved' ? (
            <Button onClick={() => setStep('list')}>返回异常列表</Button>
          ) : null}
        </>
      }
    >
      {step === 'list' ? (
        <div>
          <div className="customer-workflow__choice-list">
            {records.map((record) => (
              <button key={record.id} onClick={() => selectRecord(record)}>
                <strong>
                  {record.exceptionNo} · {record.title}
                </strong>
                <span>{record.sla}</span>
              </button>
            ))}
          </div>
          <form
            className="customer-workflow__quick-ticket"
            onSubmit={(event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              void customerPort
                .createTicket(String(form.get('description') ?? '轨迹问题'))
                .then(() => notify('工单已创建，通知发送失败；工单不回滚，可仅重试通知。'))
                .catch((error: Error) => notify(error.message));
            }}
          >
            <label>
              问题描述
              <textarea name="description" aria-label="问题描述" required />
            </label>
            <Button type="submit">提交工单</Button>
          </form>
        </div>
      ) : step === 'detail' ? (
        <div className="customer-workflow__choice-list">
          <div>
            <strong>最新轨迹 · {selected.latestEvent}</strong>
            <span>{selected.description}</span>
          </div>
          <div>
            <strong>{selected.requiredEvidence} · 必需</strong>
            <span>用于承运商核验并继续处理</span>
          </div>
          <div>
            <strong>现场联系人</strong>
            <span>{selected.contact}</span>
          </div>
        </div>
      ) : step === 'upload' ? (
        <div className="customer-workflow__form">
          <label>
            入口照片
            <input
              aria-label="入口照片"
              type="file"
              accept="image/*,.pdf"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            />
          </label>
          <label>
            现场联系人
            <input value={contact} onChange={(event) => setContact(event.target.value)} />
          </label>
          <label>
            位置说明
            <textarea value={note} onChange={(event) => setNote(event.target.value)} />
          </label>
          {file ? <p>待提交：{file.name}</p> : null}
        </div>
      ) : step === 'partial' ? (
        <div className="customer-workflow__choice-list">
          {failedNotificationIds.map((id) => (
            <div key={id} data-danger="true">
              <strong>{id} · 失败</strong>
              <span>以服务端返回的失败项为准</span>
            </div>
          ))}
          {retryComplete ? (
            <p className="customer-workflow__success-message">所有通知渠道已送达</p>
          ) : null}
        </div>
      ) : (
        <div className="customer-workflow__result">
          <strong>{current.status}</strong>
          <p>{current.description}</p>
        </div>
      )}
    </WorkflowShell>
  );
}
