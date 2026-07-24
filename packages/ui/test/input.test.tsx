import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Input } from '../src/components/input';

describe('Input', () => {
  it('connects label, hint and error accessibly', () => {
    render(<Input label="运单号" hint="支持客户单号" error="运单号不能为空" />);
    const input = screen.getByRole('textbox', { name: '运单号' });
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription('运单号不能为空');
  });
});
