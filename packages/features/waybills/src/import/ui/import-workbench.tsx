import { Button, Dialog, Input } from '@zhili/ui';
import { useState } from 'react';
import {
  memoryImportPort,
  parseImportRows,
  type ImportJobRef,
  type ImportPort,
} from '../model/import';

export interface ImportWorkbenchProps {
  port?: ImportPort;
  readOnly?: boolean;
}

export function ImportWorkbench({
  port = memoryImportPort,
  readOnly = false,
}: ImportWorkbenchProps) {
  const [csv, setCsv] = useState('');
  const [step, setStep] = useState<'upload' | 'mapping' | 'validated' | 'committed'>('upload');
  const [job, setJob] = useState<ImportJobRef | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [rollbackOpen, setRollbackOpen] = useState(false);
  const [rollbackReason, setRollbackReason] = useState('');
  const result = parseImportRows(csv);

  const run = async (operation: () => Promise<void>) => {
    setPending(true);
    setError('');
    try {
      await operation();
    } catch {
      setError('导入命令失败；批次未推进，请检查文件、权限或版本后重试。');
    } finally {
      setPending(false);
    }
  };
  return (
    <section className="order-draft">
      <header>
        <div>
          <h1>运单批量导入</h1>
          <p>粘贴 CSV → 字段映射 → 校验 → 预览 → 提交；文件上传端口待接入。</p>
        </div>
        <span>模板 v2026.07</span>
      </header>
      <fieldset>
        <legend>导入 CSV</legend>
        <textarea
          aria-label="导入 CSV"
          value={csv}
          disabled={readOnly}
          rows={8}
          onChange={(event) => setCsv(event.target.value)}
          style={{ width: '100%', fontFamily: 'monospace' }}
        />
        <Button
          disabled={readOnly || !csv.trim() || pending}
          onClick={() =>
            void run(async () => {
              const created = await port.create(`inline-csv:${csv.length}`);
              setJob(created);
              setStep('mapping');
            })
          }
        >
          {pending ? '处理中…' : '解析并映射'}
        </Button>
      </fieldset>
      {step !== 'upload' ? (
        <fieldset>
          <legend>字段映射</legend>
          <div className="order-row">
            <span>客户 → customerName</span>
            <span>重量 → weightKg</span>
            <span>目的地 → destination</span>
          </div>
          {step === 'mapping' ? (
            <Button
              disabled={!job || pending || readOnly}
              onClick={() =>
                void run(async () => {
                  if (!job) return;
                  const validated = await port.validate(job.id, job.version);
                  setJob(validated);
                  setStep('validated');
                })
              }
            >
              校验数据
            </Button>
          ) : null}
        </fieldset>
      ) : null}
      {step === 'validated' || step === 'committed' ? (
        <fieldset>
          <legend>校验与预览</legend>
          <strong>
            有效 {result.valid} 行，错误 {result.invalid} 行
          </strong>
          {result.errors.map((error, index) => (
            <p key={`${index}-${error}`} role="alert">
              {error}
            </p>
          ))}
          {step === 'validated' ? (
            <Button
              disabled={!job || pending || readOnly}
              onClick={() =>
                void run(async () => {
                  if (!job) return;
                  const committed = await port.commit(job.id, job.version, result.invalid > 0);
                  setJob(committed);
                  setStep('committed');
                })
              }
            >
              提交有效行
            </Button>
          ) : null}
        </fieldset>
      ) : null}
      {step === 'committed' ? (
        <fieldset>
          <legend>提交结果</legend>
          {job?.created !== undefined && job.failed !== undefined ? (
            <p>
              已创建 {job.created} 票，{job.failed} 行未提交；错误报告下载待文件服务端口接入。
            </p>
          ) : (
            <p>
              提交任务 {job?.jobId ?? job?.id} 已进入服务端队列（{job?.status ?? 'QUEUED'}
              ）；完成数量以任务结果为准。
            </p>
          )}
          <Button
            variant="danger"
            disabled={!job || pending || readOnly}
            onClick={() => setRollbackOpen(true)}
          >
            回滚本批次
          </Button>
        </fieldset>
      ) : null}
      {message ? <p role="status">{message}</p> : null}
      {error ? <p role="alert">{error}</p> : null}
      <Dialog
        open={rollbackOpen}
        title="确认回滚导入批次"
        description="仅回滚本批次创建且仍可逆的记录；外部已消费或后续已变更的记录会逐项拒绝。"
        onOpenChange={setRollbackOpen}
        footer={
          <>
            <Button variant="secondary" disabled={pending} onClick={() => setRollbackOpen(false)}>
              返回
            </Button>
            <Button
              variant="danger"
              disabled={!job || rollbackReason.trim().length < 10 || pending}
              onClick={() =>
                void run(async () => {
                  if (!job) return;
                  const rolledBack = await port.rollback(
                    job.id,
                    job.version,
                    rollbackReason.trim()
                  );
                  setJob(rolledBack);
                  setRollbackOpen(false);
                  setRollbackReason('');
                  setMessage('本批次已回滚；已创建记录的血缘和审计仍保留。');
                })
              }
            >
              {pending ? '回滚中…' : '确认回滚'}
            </Button>
          </>
        }
      >
        <div className="waybill-danger">
          <strong>影响：撤销批次 {job?.id} 创建的全部可逆业务记录</strong>
          <span>
            批次 {job?.id} · 当前版本 v{job?.version}
          </span>
          <span>审计：import.batch.rolled-back / 当前租户 / 操作人张伟</span>
        </div>
        <Input
          label="回滚原因"
          value={rollbackReason}
          onChange={(event) => setRollbackReason(event.target.value)}
          hint="至少 10 个字；原因将写入批次与逐条记录审计。"
        />
      </Dialog>
    </section>
  );
}
