import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Dialog } from '../src/components/dialog';
import { Drawer } from '../src/components/drawer';

describe('Dialog and Drawer', () => {
  it('closes a dialog with Escape and describes dangerous impact', async () => {
    const onOpenChange = vi.fn();
    const user = userEvent.setup();
    render(
      <Dialog open title="反审核账单" description="将影响已核销金额" onOpenChange={onOpenChange}>
        <button>确认反审核</button>
      </Dialog>
    );
    expect(screen.getByRole('dialog', { name: '反审核账单' })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('keeps keyboard focus inside an open dialog', async () => {
    const user = userEvent.setup();
    render(
      <>
        <button>页面操作</button>
        <Dialog open title="危险确认" onOpenChange={() => undefined}>
          <button>确认执行</button>
        </Dialog>
      </>
    );
    expect(screen.getByRole('button', { name: '关闭' })).toHaveFocus();
    await user.keyboard('{Shift>}{Tab}{/Shift}');
    expect(screen.getByRole('button', { name: '确认执行' })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: '关闭' })).toHaveFocus();
  });

  it('renders the fixed drawer anatomy', () => {
    render(
      <Drawer open title="运单详情" footer={<button>关闭</button>} onOpenChange={() => undefined}>
        S2505120004
      </Drawer>
    );
    const drawer = screen.getByRole('dialog', { name: '运单详情' });
    expect(drawer).toHaveAttribute('data-size', '480');
    expect(screen.getByText('S2505120004')).toBeInTheDocument();
  });
});
