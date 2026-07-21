import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { RateCatalogPanel } from '../ui/rate-catalog-panel';
import { validateRateCard, rateCatalogFixture } from '../model/catalog';

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
});
