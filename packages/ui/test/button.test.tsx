import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Button } from '../src/components/button';

describe('Button', () => {
  it('runs one primary command and exposes loading state', async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    const { rerender } = render(<Button onClick={onClick}>提交预报</Button>);
    await user.click(screen.getByRole('button', { name: '提交预报' }));
    expect(onClick).toHaveBeenCalledOnce();

    rerender(<Button loading>提交预报</Button>);
    expect(screen.getByRole('button')).toBeDisabled();
    expect(screen.getByRole('button')).toHaveAttribute('aria-busy', 'true');
  });
});
