import { Button, Input } from '@zhili/ui';
import { useState, type FormEvent } from 'react';
import type { SessionInfo, SessionPort } from '../model/session';
import { sessionErrorMessage } from '../model/session';
import './login-shell.css';

export interface LoginShellProps {
  api: SessionPort;
  onAuthenticated: (session: SessionInfo) => void;
}

export function LoginShell({ api, onAuthenticated }: LoginShellProps) {
  const [account, setAccount] = useState('');
  const [password, setPassword] = useState('');
  const [state, setState] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setState('loading');
    setMessage('');
    try {
      const session = await api.login({ account: account.trim(), password });
      setState('success');
      setMessage('正在进入运营工作台…');
      onAuthenticated(session);
    } catch (error) {
      setState('error');
      setMessage(sessionErrorMessage(error));
    }
  };

  return (
    <main className="zhili-login">
      <section className="zhili-login__panel" aria-labelledby="login-title">
        <div className="zhili-login__brand" aria-hidden="true">
          智
        </div>
        <h1 id="login-title">智立科技物流AI系统</h1>
        <p>运营、报价、订单、仓配与结算使用同一工作台</p>
        <form onSubmit={submit}>
          <Input
            label="账号"
            name="account"
            autoComplete="username"
            value={account}
            required
            onChange={(event) => setAccount(event.target.value)}
          />
          <Input
            label="密码"
            name="password"
            type="password"
            autoComplete="current-password"
            value={password}
            required
            onChange={(event) => setPassword(event.target.value)}
          />
          {message ? (
            <p className="zhili-login__message" role={state === 'error' ? 'alert' : 'status'}>
              {message}
            </p>
          ) : null}
          <Button type="submit" size="large" loading={state === 'loading'}>
            登录系统
          </Button>
        </form>
        <small>会话使用 HttpOnly Cookie；连续失败将触发限流。</small>
      </section>
    </main>
  );
}
