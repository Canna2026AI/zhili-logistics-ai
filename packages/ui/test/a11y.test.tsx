import { render } from '@testing-library/react';
import axe from 'axe-core';
import { describe, expect, it } from 'vitest';
import { AppShell } from '../src/components/app-shell';
import { Button } from '../src/components/button';
import { Input } from '../src/components/input';
import { StatusTag } from '../src/components/status-tag';

describe('shared UI accessibility', () => {
  it('has no automatically detectable WCAG A/AA violations in the core shell', async () => {
    const { container } = render(
      <AppShell
        brand="智立科技物流AI系统"
        tenant="智立科技（深圳）有限公司"
        navigation={[{ label: '订单履约', items: [{ id: 'waybills', label: '订单运单' }] }]}
        activeNavigationId="waybills"
        tabs={[{ id: 'waybills', label: '运单' }]}
        activeTabId="waybills"
      >
        <h1>运单管理</h1>
        <Input label="运单号" defaultValue="S2505120004" />
        <StatusTag tone="success">已收货</StatusTag>
        <Button>新建预报</Button>
      </AppShell>
    );
    const result = await axe.run(container, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] },
      rules: {
        region: { enabled: false },
        'color-contrast': { enabled: false },
      },
    });
    expect(result.violations).toEqual([]);
  });
});
