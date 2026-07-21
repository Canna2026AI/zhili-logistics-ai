import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LoginShell } from '../ui/login-shell';
import { createSessionApi } from '../adapters/api/session-api';

describe('identity session', () => {
  it('submits credentials through the typed session port', async () => {
    const login = vi.fn().mockResolvedValue({
      subjectId: 'usr-zhang',
      tenantId: 'tenant-zhili',
      expiresAt: '2026-07-22T18:00:00+08:00',
      permissionsVersion: 7,
    });

    render(<LoginShell api={{ login } as never} onAuthenticated={() => undefined} />);
    fireEvent.change(screen.getByLabelText('账号'), { target: { value: 'zhangwei' } });
    fireEvent.change(screen.getByLabelText('密码'), { target: { value: 'correct-password' } });
    fireEvent.click(screen.getByRole('button', { name: '登录系统' }));

    expect(await screen.findByText('正在进入运营工作台…')).toBeInTheDocument();
    expect(login).toHaveBeenCalledWith({ account: 'zhangwei', password: 'correct-password' });
  });

  it('maps session expiration into an actionable state', async () => {
    const login = vi.fn().mockRejectedValue({ code: 'SESSION_EXPIRED' });
    render(<LoginShell api={{ login } as never} onAuthenticated={() => undefined} />);
    fireEvent.change(screen.getByLabelText('账号'), { target: { value: 'zhangwei' } });
    fireEvent.change(screen.getByLabelText('密码'), { target: { value: 'expired' } });
    fireEvent.click(screen.getByRole('button', { name: '登录系统' }));
    expect(await screen.findByText(/登录状态已过期/)).toBeInTheDocument();
  });

  it('creates a cookie-authenticated OpenAPI session adapter', async () => {
    const POST = vi.fn().mockResolvedValue({
      data: {
        data: {
          id: 'session-1',
          subjectId: 'usr-zhang',
          tenantId: 'tenant-zhili',
          expiresAt: '2026-07-22T18:00:00+08:00',
          permissionsVersion: 7,
        },
        meta: {},
      },
    });
    const adapter = createSessionApi({ POST } as never);
    await expect(
      adapter.login({ account: 'zhangwei', password: 'password' })
    ).resolves.toMatchObject({
      tenantId: 'tenant-zhili',
    });
    expect(POST).toHaveBeenCalledWith('/auth/password/sessions', {
      body: { account: 'zhangwei', password: 'password' },
    });
  });

  it('refreshes, reauthenticates and logs out through generated session paths', async () => {
    const POST = vi.fn().mockResolvedValue({
      data: {
        data: {
          subjectId: 'usr-zhang',
          tenantId: 'tenant-zhili',
          expiresAt: '2026-07-22T20:00:00+08:00',
          permissionsVersion: 8,
        },
      },
    });
    const DELETE = vi.fn().mockResolvedValue({});
    const adapter = createSessionApi({ POST, DELETE } as never);
    await adapter.refresh();
    await adapter.reauthenticate({
      subjectId: 'usr-zhang',
      tenantId: 'tenant-zhili',
      expiresAt: '2026-07-22T20:00:00+08:00',
      permissionsVersion: 8,
    });
    await adapter.logout();
    expect(POST).toHaveBeenCalledWith('/auth/sessions:refresh');
    expect(POST).toHaveBeenCalledWith('/auth/sessions/current:reauthenticate', {
      body: expect.objectContaining({ subjectId: 'usr-zhang' }),
    });
    expect(DELETE).toHaveBeenCalledWith('/auth/sessions/current');
  });
});
