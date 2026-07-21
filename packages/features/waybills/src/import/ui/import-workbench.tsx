import { Button } from '@zhili/ui';
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
          <p>上传 → 字段映射 → 校验 → 预览 → 提交；错误行不进入业务库。</p>
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
          <p>
            已创建 {result.valid} 票，{result.invalid} 行未提交；错误文件可下载并修正后重试。
          </p>
          <Button
            variant="danger"
            disabled={!job || pending || readOnly}
            onClick={() =>
              void run(async () => {
                if (!job) return;
                const rolledBack = await port.rollback(job.id, job.version);
                setJob(rolledBack);
                setMessage('本批次已回滚；已创建记录的血缘和审计仍保留。');
              })
            }
          >
            回滚本批次
          </Button>
        </fieldset>
      ) : null}
      {message ? <p role="status">{message}</p> : null}
      {error ? <p role="alert">{error}</p> : null}
    </section>
  );
}
