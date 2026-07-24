import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StatusTag } from '../src/components/status-tag';

describe('StatusTag', () => {
  it('never communicates status by color alone', () => {
    render(<StatusTag tone="warning">待补资料</StatusTag>);
    const tag = screen.getByText('待补资料').closest('[data-tone]');
    expect(tag).toHaveAttribute('data-tone', 'warning');
    expect(tag?.querySelector('svg')).not.toBeNull();
  });
});
