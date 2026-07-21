import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { RateCatalogPanel } from '../ui/rate-catalog-panel';
import { validateRateCard, rateCatalogFixture } from '../model/catalog';
import { createRateCatalogApi } from '../adapters/api/rate-catalog-api';

describe('rate catalog', () => {
  it('covers channel products, zones, prices, surcharges, restrictions and special prices', () => {
    expect(rateCatalogFixture.map((item) => item.kind)).toEqual([
      '渠道产品',
      '分区',
      '价卡',
      '附加费',
      '限制',
      '特殊价',
    ]);
  });

  it('blocks publish when the card has overlapping price ranges', () => {
    expect(
      validateRateCard([
        { from: 0, to: 10 },
        { from: 9, to: 20 },
      ])
    ).toMatchObject({ valid: false });
  });

  it('requires a dangerous confirmation with impact, reason, version and audit destination', () => {
    render(<RateCatalogPanel />);
    fireEvent.click(screen.getByRole('button', { name: '发布价卡' }));
    expect(screen.getByText(/将影响 12 个客户特殊价/)).toBeInTheDocument();
    expect(screen.getByText(/当前版本 v3 → v4/)).toBeInTheDocument();
    expect(screen.getByText(/审计日志：rate-card\.publish/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '确认发布' })).toBeDisabled();
  });

  it('awaits rate-card publication and renders the new immutable version', async () => {
    const publish = vi.fn(async () => ({ version: 'v4', status: '生效' as const }));
    render(<RateCatalogPanel port={{ publish } as never} />);
    fireEvent.click(screen.getByRole('button', { name: '发布价卡' }));
    fireEvent.change(screen.getByLabelText('发布原因'), {
      target: { value: '新财年合同价统一生效' },
    });
    fireEvent.click(screen.getByRole('button', { name: '确认发布' }));
    await waitFor(() => expect(publish).toHaveBeenCalledWith('rate-dhl', 3, expect.any(String)));
    expect(await screen.findByRole('status')).toHaveTextContent('价卡 v4 已发布');
  });

  it('shows rejected publication and disables publishing for read-only users', async () => {
    const publish = vi.fn(async () => {
      throw new Error('STALE_VERSION');
    });
    const { unmount } = render(<RateCatalogPanel port={{ publish } as never} />);
    fireEvent.click(screen.getByRole('button', { name: '发布价卡' }));
    fireEvent.change(screen.getByLabelText('发布原因'), {
      target: { value: '合同价格调整需立即生效' },
    });
    fireEvent.click(screen.getByRole('button', { name: '确认发布' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('发布失败');
    unmount();
    render(<RateCatalogPanel readOnly port={{ publish } as never} />);
    expect(screen.getByRole('button', { name: '发布价卡' })).toBeDisabled();
  });

  it('publishes through the generated versioned rate-card path', async () => {
    const POST = vi.fn().mockResolvedValue({ data: { data: { version: 4 } } });
    const api = createRateCatalogApi({ POST } as never, () => 'idem-rate');
    await expect(api.publish('rate-dhl', 3, '合同价版本升级')).resolves.toMatchObject({
      version: 'v4',
    });
    expect(POST).toHaveBeenCalledWith(
      '/rates/rate-cards/{rateCardId}:publish',
      expect.objectContaining({
        params: {
          path: { rateCardId: 'rate-dhl' },
          header: { 'Idempotency-Key': 'idem-rate', 'If-Match': '"3"' },
        },
      })
    );
  });
});
