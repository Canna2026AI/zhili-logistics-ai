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
      <section className="pda-login-card" aria-labelledby="login-title">
        <div className="pda-brand-mark" aria-hidden="true">
          ZL
        </div>
        <h1 id="login-title">设备登录与仓库绑定</h1>
        <p>绑定会限定任务的租户、用户和仓库范围。</p>
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
        <form onSubmit={submit} className="pda-form">
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
            绑定设备并登录
          </Button>
        </form>
      </section>
    </main>
  );
}
