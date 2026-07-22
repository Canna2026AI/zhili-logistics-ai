// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LoginScreen } from './login-screen';

describe('LoginScreen F09 binding state', () => {
  afterEach(cleanup);

  it('presents the device-scope review before submitting the editable binding form', () => {
    render(<LoginScreen busy={false} pendingCount={0} onBind={vi.fn()} />);

    expect(screen.getByRole('heading', { name: '绑定设备与仓库' })).toBeVisible();
    expect(screen.getByText(/tenant \/ subject \/ device \/ warehouse 四重绑定/)).toBeVisible();
    expect(screen.getByText('当前设备尚未完成安全绑定')).toBeVisible();
    expect(screen.getByRole('button', { name: '绑定设备并登录' })).toHaveTextContent(
      '绑定并继续'
    );
  });
});
