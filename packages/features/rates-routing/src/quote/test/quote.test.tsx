import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { QuoteWorkbench } from '../ui/quote-workbench';
import { calculateQuote, quoteInputFixture } from '../model/quote';
import { createQuoteApi } from '../adapters/api/quote-api';

describe('multi-channel quote', () => {
  it('derives chargeable weight and canonical amount from line formulas', () => {
    const quote = calculateQuote(quoteInputFixture);
    expect(quote.chargeableWeightKg).toBe('123.50');
    expect(quote.options[0]?.total.amount).toBe('5320.00');
    expect(quote.options[0]?.lines.reduce((sum, line) => sum + Number(line.amount.amount), 0)).toBe(
      5320
    );
  });

  it('selects a channel and displays rule-by-rule explanation', () => {
    render(<QuoteWorkbench state="normal" />);
    fireEvent.click(screen.getByRole('radio', { name: /DHL Express/ }));
    expect(screen.getAllByText('CNY 5,320.00')).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: '查看解释' }));
    expect(screen.getByText(/RATE-DHL-CN-US-2026\.05-v3/)).toBeInTheDocument();
    expect(screen.getByText(/计费重取实重与材积重较大值/)).toBeInTheDocument();
  });

  it('masks costs and profits when the permission is absent', () => {
    render(<QuoteWorkbench state="forbidden-cost" />);
    expect(screen.getByText('成本与利润：••••')).toBeInTheDocument();
    expect(screen.getByText(/缺少 rate\.cost\.read/)).toBeInTheDocument();
  });

  it('preserves the old result when its rate version is stale', () => {
    render(<QuoteWorkbench state="stale" />);
    expect(screen.getByText(/价卡已从 v3 发布为 v4/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '按 v4 重新计算' })).toBeInTheDocument();
  });

  it('uses the generated OpenAPI paths for quote and explanation', async () => {
    const POST = vi.fn().mockResolvedValue({ data: { data: { id: 'quote-1' }, meta: {} } });
    const GET = vi.fn().mockResolvedValue({ data: { data: { quoteId: 'quote-1' }, meta: {} } });
    const adapter = createQuoteApi({ POST, GET } as never);
    await adapter.create(quoteInputFixture.request);
    await adapter.explain('quote-1');
    expect(POST).toHaveBeenCalledWith('/quotes', {
      body: quoteInputFixture.request,
      params: { header: { 'Idempotency-Key': expect.any(String) } },
    });
    expect(GET).toHaveBeenCalledWith('/quotes/{quoteId}/explanation', {
      params: { path: { quoteId: 'quote-1' } },
    });
  });
});
