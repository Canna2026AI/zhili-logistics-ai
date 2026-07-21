import { useState } from 'react';
import { AlertTriangle, Camera, CheckCircle2, CloudOff, RefreshCw, ScanLine } from 'lucide-react';
import { Button, StatusTag } from '@zhili/ui';

export function App() {
  const [code, setCode] = useState('S2505120004');
  const [message, setMessage] = useState('等待扫描');
  const scan = () =>
    setMessage(code === 'S2505120004' ? '收货成功：实收 123.50 kg' : '未找到预报，请人工处理');
  return (
    <main className="pda-app">
      <header>
        <div>
          <strong>深圳一号仓</strong>
          <span>PDA-SZX-03</span>
        </div>
        <StatusTag tone="warning">
          <CloudOff size={12} />
          离线 · 待同步 183/200
        </StatusTag>
      </header>
      <section className="pda-alert">
        <AlertTriangle aria-hidden="true" />
        <div>
          <strong>待同步队列接近上限（183/200）</strong>
          <span>队列满后将停止新业务扫描，请尽快同步。</span>
        </div>
      </section>
      <section className="pda-scan">
        <label htmlFor="scan-code">扫描运单号</label>
        <div>
          <ScanLine aria-hidden="true" />
          <input
            id="scan-code"
            value={code}
            onChange={(event) => setCode(event.target.value)}
            onKeyDown={(event) => event.key === 'Enter' && scan()}
          />
        </div>
        <Button size="large" onClick={scan}>
          确认收货
        </Button>
      </section>
      <section
        className="pda-result"
        data-success={message.startsWith('收货成功') || undefined}
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {message.startsWith('收货成功') ? (
          <CheckCircle2 aria-hidden="true" />
        ) : (
          <ScanLine aria-hidden="true" />
        )}
        <strong>{message}</strong>
        <span>
          {message.startsWith('收货成功')
            ? '预报 122.00 kg · 差异 +1.50 kg（+1.23%）'
            : '扫描枪或相机读取后立即显示结果'}
        </span>
      </section>
      <section className="pda-actions">
        <button>
          <Camera aria-hidden="true" />
          <span>补拍照片</span>
        </button>
        <button>
          <RefreshCw aria-hidden="true" />
          <span>立即同步</span>
        </button>
      </section>
      <section className="pda-queue">
        <div>
          <h2>最近队列记录（展示4条）</h2>
          <button>导出</button>
        </div>
        {[
          '#1842 · S2505120004 · 待同步',
          '#1841 · S2505120003 · 媒体补传',
          '#1840 · S2505120002 · 版本冲突',
          '#1839 · S2505120001 · 登录失效待续传',
        ].map((row, index) => (
          <p key={row}>
            <span>{row}</span>
            <StatusTag tone={index < 2 ? 'warning' : 'danger'}>
              {index < 2 ? '待处理' : '需人工'}
            </StatusTag>
          </p>
        ))}
      </section>
    </main>
  );
}
