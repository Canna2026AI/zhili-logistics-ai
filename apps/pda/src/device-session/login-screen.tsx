import { useState, type FormEvent } from 'react';
import { Button } from '@zhili/ui';

export interface BindingInput {
  deviceId: string;
  deviceCode: string;
  warehouseId: string;
  subjectId: string;
}

export function LoginScreen({
  busy,
  error,
  pendingCount,
  onBind,
}: {
  busy: boolean;
  error?: string;
  pendingCount: number;
  onBind: (input: BindingInput) => Promise<void>;
}) {
  const [input, setInput] = useState<BindingInput>({
    deviceId: '01JDEVICE00000000000000003',
    deviceCode: 'PDA-SZX-03',
    warehouseId: '01JWAREHOUSE00000000000001',
    subjectId: '01JSUBJECT0000000000000001',
  });
  const update = (key: keyof BindingInput, value: string) =>
    setInput((current) => ({ ...current, [key]: value }));
  const submit = (event: FormEvent) => {
    event.preventDefault();
    void onBind(input);
  };

  return (
    <main className="pda-login-shell">
      <header className="pda-login-header">
        <span aria-hidden="true">‹</span>
        <strong>智立科技物流AI系统</strong>
        <em>需绑定</em>
      </header>
      <section className="pda-login-card pda-login-card--binding" aria-labelledby="login-title">
        <h2 className="pda-sr-only">设备登录与仓库绑定</h2>
        <h1 id="login-title">绑定设备与仓库</h1>
        <p>首次登录或切换工作范围时必须重新认证</p>
        <div className="pda-flow-summary">
          <strong>设备 {input.deviceCode} · App 0.2.0</strong>
          <span>tenant / subject / device / warehouse 四重绑定</span>
        </div>
        <div className="pda-flow-alert">
          <strong>当前设备尚未完成安全绑定</strong>
          <span>未绑定前不会下载任务，也不会写入离线队列。</span>
        </div>
        {pendingCount > 0 && (
          <div className="pda-message pda-message--warning" role="alert">
            本机还有 {pendingCount} 条未同步数据，不允许换用户或仓库。
          </div>
        )}
        {error && (
          <div className="pda-message pda-message--danger" role="alert">
            {error}
          </div>
        )}
        <form onSubmit={submit} className="pda-form pda-binding-form">
          <strong>绑定信息</strong>
          <label>
            设备编码
            <input
              value={input.deviceCode}
              onChange={(event) => update('deviceCode', event.target.value)}
            />
          </label>
          <label>
            设备 ID
            <input
              value={input.deviceId}
              onChange={(event) => update('deviceId', event.target.value)}
            />
          </label>
          <p className="pda-form-note">租户与权限由服务器根据设备绑定返回，终端不允许自行填写。</p>
          <label>
            仓库 ID
            <input
              value={input.warehouseId}
              onChange={(event) => update('warehouseId', event.target.value)}
            />
          </label>
          <label>
            用户 ID
            <input
              value={input.subjectId}
              onChange={(event) => update('subjectId', event.target.value)}
            />
          </label>
          <Button type="submit" size="large" loading={busy} disabled={busy}>
            <span aria-label="绑定设备并登录">绑定并继续</span>
          </Button>
        </form>
      </section>
    </main>
  );
}
