import { Button } from '@zhili/ui';
import { useState } from 'react';
import { parseImportRows } from '../model/import';

export function ImportWorkbench() {
  const [csv, setCsv] = useState('');
  const [step, setStep] = useState<'upload' | 'mapping' | 'validated' | 'committed'>('upload');
  const result = parseImportRows(csv);
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
          rows={8}
          onChange={(event) => setCsv(event.target.value)}
          style={{ width: '100%', fontFamily: 'monospace' }}
        />
        <Button disabled={!csv.trim()} onClick={() => setStep('mapping')}>
          解析并映射
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
            <Button onClick={() => setStep('validated')}>校验数据</Button>
          ) : null}
        </fieldset>
      ) : null}
      {step === 'validated' || step === 'committed' ? (
        <fieldset>
          <legend>校验与预览</legend>
          <strong>
            有效 {result.valid} 行，错误 {result.invalid} 行
          </strong>
          {result.errors.map((error) => (
            <p key={error} role="alert">
              {error}
            </p>
          ))}
          {step === 'validated' ? (
            <Button onClick={() => setStep('committed')}>提交有效行</Button>
          ) : null}
        </fieldset>
      ) : null}
      {step === 'committed' ? (
        <fieldset>
          <legend>提交结果</legend>
          <p>
            已创建 {result.valid} 票，{result.invalid} 行未提交；错误文件可下载并修正后重试。
          </p>
          <Button variant="danger">回滚本批次</Button>
        </fieldset>
      ) : null}
    </section>
  );
}
