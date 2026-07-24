import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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

  it('selects a channel and displays rule-by-rule explanation', async () => {
    render(<QuoteWorkbench state="normal" />);
    fireEvent.click(screen.getByRole('radio', { name: /DHL Express/ }));
    expect(screen.getAllByText('CNY 5,320.00')).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: '查看解释' }));
    expect(await screen.findByText(/RATE-DHL-CN-US-2026\.05-v3/)).toBeInTheDocument();
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
    const POST = vi.fn().mockResolvedValue({
      data: {
        data: {
          id: 'quote-1',
          quoteNo: 'Q-1',
          status: 'CALCULATED',
          validUntil: '2026-07-23T10:00:00+08:00',
          version: 1,
          options: [
            {
              id: 'option-1',
              channelProductId: 'product-1',
              chargeableWeightKg: '123.50',
              lines: [],
              total: { amount: '1.00', currency: 'CNY' },
              available: true,
            },
          ],
        },
        meta: {},
      },
    });
    const GET = vi.fn().mockResolvedValue({
      data: {
        data: { quoteId: 'quote-1', rateCardVersion: 'RATE-v1', steps: [] },
        meta: {},
      },
    });
    const adapter = createQuoteApi({ POST, GET } as never);
    await adapter.create({
      quote: quoteInputFixture.request,
      orderContext: { orderType: 'STANDARD' },
    });
    await adapter.explain({ quoteId: 'quote-1', optionId: 'option-1', version: 1 });
    expect(POST).toHaveBeenCalledWith('/quotes', {
      body: quoteInputFixture.request,
      params: { header: { 'Idempotency-Key': expect.any(String) } },
    });
    expect(GET).toHaveBeenCalledWith('/quotes/{quoteId}/explanation', {
      params: { path: { quoteId: 'quote-1' } },
    });
  });

  it('uses the server quote options, lines and totals without replacing them with local formulas', async () => {
    const POST = vi.fn().mockResolvedValue({
      data: {
        data: {
          id: 'quote-server-1',
          quoteNo: 'Q-SERVER-1',
          status: 'CALCULATED',
          validUntil: '2026-07-23T10:00:00+08:00',
          version: 6,
          options: [
            {
              id: 'option-server-1',
              channelProductId: 'channel-product-server-1',
              chargeableWeightKg: '88.00',
              available: true,
              lines: [
                {
                  code: 'REMOTE_RATE',
                  label: '服务端运费',
                  amount: { amount: '999.99', currency: 'CNY' },
                  ruleVersion: 'REMOTE-v9',
                },
              ],
              total: { amount: '999.99', currency: 'CNY' },
            },
          ],
        },
        meta: {},
      },
    });
    const adapter = createQuoteApi({ POST, GET: vi.fn() } as never, () => 'server-quote');
    const quote = await adapter.create({
      quote: quoteInputFixture.request,
      orderContext: { orderType: 'STANDARD' },
    } as never);
    expect(quote).toMatchObject({
      id: 'quote-server-1',
      quoteNo: 'Q-SERVER-1',
      version: 6,
      chargeableWeightKg: '88.00',
      options: [
        {
          id: 'option-server-1',
          product: 'channel-product-server-1',
          total: { amount: '999.99', currency: 'CNY' },
          lines: [{ code: 'REMOTE_RATE', ruleVersion: 'REMOTE-v9' }],
        },
      ],
    });
  });

  it('builds a request from controlled weight and awaits a refreshed calculation', async () => {
    const create = vi.fn(async (workflow: { quote: typeof quoteInputFixture.request }) =>
      calculateQuote({ request: workflow.quote, volumeDivisor: 6000 })
    );
    const explain = vi.fn(async (snapshot) => ({
      ...snapshot,
      rateCardVersion: 'RATE-DHL-v4',
      steps: ['200 kg'],
    }));
    const accept = vi.fn(async () => ({ acceptedOptionId: 'dhl-express', version: 2 }));
    render(<QuoteWorkbench port={{ create, explain, accept } as never} />);
    fireEvent.change(screen.getByLabelText('实重 (kg)'), { target: { value: '200.00' } });
    fireEvent.click(screen.getByRole('button', { name: '刷新报价' }));
    await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    expect(screen.getByText('200.00 kg')).toBeInTheDocument();
    expect(screen.getAllByText('CNY 8,537.83')).toHaveLength(2);
  });

  it('builds the quote workflow request from address, postal code, dimensions, weight and FBA fields', async () => {
    const create = vi.fn(async (workflow: never) =>
      calculateQuote({
        request: (workflow as { quote: typeof quoteInputFixture.request }).quote,
        volumeDivisor: 6000,
      })
    );
    render(
      <QuoteWorkbench
        port={
          {
            create,
            explain: vi.fn(),
            accept: vi.fn(),
            saveDraft: vi.fn(),
            submitForecast: vi.fn(),
          } as never
        }
      />
    );
    fireEvent.change(screen.getByLabelText('订单类型'), { target: { value: 'FBA' } });
    fireEvent.change(screen.getByLabelText('Amazon Shipment ID'), {
      target: { value: 'FBA-NEW-100' },
    });
    fireEvent.change(screen.getByLabelText('目标仓'), { target: { value: 'ONT8' } });
    fireEvent.change(screen.getByLabelText('目的地邮编'), { target: { value: '91761' } });
    fireEvent.change(screen.getByLabelText('长 (cm)'), { target: { value: '200' } });
    fireEvent.change(screen.getByLabelText('宽 (cm)'), { target: { value: '200' } });
    fireEvent.change(screen.getByLabelText('高 (cm)'), { target: { value: '200' } });
    fireEvent.change(screen.getByLabelText('实重 (kg)'), { target: { value: '50.00' } });
    fireEvent.click(screen.getByRole('button', { name: '刷新报价' }));
    await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    expect(create.mock.calls[0]?.[0]).toMatchObject({
      quote: {
        destination: { postalCode: '91761' },
        packages: [
          {
            weightKg: '50.00',
            lengthCm: '200',
            widthCm: '200',
            heightCm: '200',
          },
        ],
      },
      orderContext: {
        orderType: 'FBA',
        fba: { shipmentId: 'FBA-NEW-100', fulfillmentCenter: 'ONT8' },
      },
    });
    expect(screen.getByLabelText('材积重 (kg)')).toHaveValue('1333.33');
    expect(screen.getByText('1333.33 kg')).toBeInTheDocument();
  });

  it('loads option-specific explanation and accepts the selected immutable snapshot', async () => {
    const create = vi.fn(async () => calculateQuote(quoteInputFixture));
    const explain = vi.fn(async (snapshot) => ({
      ...snapshot,
      rateCardVersion: snapshot.optionId === 'ups-saver' ? 'RATE-UPS-v5' : 'RATE-DHL-v3',
      steps: [`${snapshot.optionId} / 123.50 kg`],
    }));
    const accept = vi.fn(async () => ({ acceptedOptionId: 'ups-saver', version: 2 }));
    render(<QuoteWorkbench port={{ create, explain, accept } as never} />);
    fireEvent.click(screen.getByRole('radio', { name: /UPS Worldwide Saver/ }));
    expect(screen.getByText(/成本 CNY 4,710.00/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '查看解释' }));
    expect(await screen.findByText('RATE-UPS-v5')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '接受报价' }));
    await waitFor(() => expect(accept).toHaveBeenCalledWith('quote-2505120042', 'ups-saver', 1));
  });

  it('never keeps an explanation after changing the selected option or quote input', async () => {
    render(<QuoteWorkbench />);
    fireEvent.click(screen.getByRole('button', { name: '查看解释' }));
    expect(await screen.findByText(/RATE-DHL-CN-US-2026\.05-v3/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('radio', { name: /UPS Worldwide Saver/ }));
    expect(screen.queryByText(/RATE-DHL-CN-US-2026\.05-v3/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '查看解释' }));
    expect(await screen.findByText(/RATE-UPS-CN-US-2026\.05-v5/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('目的地邮编'), { target: { value: '91761' } });
    expect(screen.queryByText(/RATE-UPS-CN-US-2026\.05-v5/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '查看解释' })).toBeDisabled();
  });

  it.each([
    ['保存草稿', 'saveDraft'],
    ['提交预报', 'submitForecast'],
    ['接受报价', 'accept'],
  ] as const)(
    'surfaces a rejected %s command without a success message',
    async (button, method) => {
      const port = {
        create: vi.fn(),
        explain: vi.fn(),
        accept: vi.fn(),
        saveDraft: vi.fn(),
        submitForecast: vi.fn(),
      };
      port[method].mockRejectedValue(new Error('COMMAND_REJECTED'));
      render(<QuoteWorkbench port={port as never} />);
      fireEvent.click(screen.getByRole('button', { name: button }));
      expect(await screen.findByRole('alert')).toHaveTextContent('执行失败');
      expect(screen.queryByText(/已接受|草稿 .*已保存|预报已提交/)).not.toBeInTheDocument();
    }
  );

  it('surfaces quote port rejection and allows retry', async () => {
    const create = vi
      .fn()
      .mockRejectedValueOnce(new Error('NO_RATE'))
      .mockResolvedValueOnce(calculateQuote(quoteInputFixture));
    render(<QuoteWorkbench port={{ create, explain: vi.fn(), accept: vi.fn() } as never} />);
    fireEvent.click(screen.getByRole('button', { name: '刷新报价' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('报价失败');
    fireEvent.click(screen.getByRole('button', { name: '重试报价' }));
    await waitFor(() => expect(create).toHaveBeenCalledTimes(2));
  });
});
