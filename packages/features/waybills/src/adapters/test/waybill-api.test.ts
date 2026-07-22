import { describe, expect, it, vi } from 'vitest';
import { createWaybillApi } from '../api/waybill-api';

describe('waybill OpenAPI adapter', () => {
  it('calls generated paths with version and idempotency headers', async () => {
    const GET = vi.fn().mockResolvedValue({
      data: {
        data: {
          id: 'waybill-1',
          waybillNo: 'S2505120004',
          masterNo: 'HBL2505120004',
          customer: '深圳鑫源贸易有限公司',
          customerCode: 'CUST00256',
          contactName: '王志强',
          contactPhone: '139 2654 8800',
          route: 'CN-SZX → US-LAX',
          service: 'DHL Express Worldwide',
          transport: '海运整箱',
          pieces: 18,
          forecastWeightKg: '122.00',
          actualWeightKg: '123.50',
          volumeM3: '0.48',
          createdAt: '2025-05-12 08:16',
          state: '待分货',
          version: 7,
          branch: '深圳分公司',
          timeline: ['待分货 · 深圳仓库'],
        },
      },
    });
    const POST = vi.fn(async (path: string) =>
      path === '/waybills:batch-command'
        ? { data: { data: { succeeded: ['waybill-1'], failed: [] } } }
        : { data: { data: { resourceId: 'waybill-1', status: 'SUCCEEDED', version: 8 } } }
    );
    const adapter = createWaybillApi({ GET, POST } as never, () => 'idempotency-1');
    await adapter.get('waybill-1');
    await adapter.submit('waybill-1', 7);
    await adapter.createLabel('waybill-1', 7, 'A4');
    await adapter.batch(['waybill-1'], 'CANCEL', 7, '客户书面申请取消');
    await adapter.renumber('waybill-1', 7, 'S2505129999');
    await adapter.split('waybill-1', 7, ['PKG-01']);
    await adapter.merge(['waybill-1', 'waybill-2'], 7);
    expect(GET).toHaveBeenCalledWith('/waybills/{waybillId}', {
      params: { path: { waybillId: 'waybill-1' } },
    });
    expect(POST).toHaveBeenCalledWith(
      '/waybills/{waybillId}:submit',
      expect.objectContaining({
        params: expect.objectContaining({
          header: expect.objectContaining({ 'If-Match': '"7"' }),
        }),
      })
    );
    expect(POST).toHaveBeenCalledWith(
      '/waybills/{waybillId}/label-jobs',
      expect.objectContaining({ body: expect.objectContaining({ format: 'A4' }) })
    );
    expect(POST).toHaveBeenCalledWith(
      '/waybills:batch-command',
      expect.objectContaining({ body: expect.objectContaining({ command: 'CANCEL' }) })
    );
    expect(POST).toHaveBeenCalledWith(
      '/waybills/{waybillId}:renumber',
      expect.objectContaining({ body: expect.objectContaining({ waybillNo: 'S2505129999' }) })
    );
    expect(POST).toHaveBeenCalledWith(
      '/waybills:split',
      expect.objectContaining({ body: expect.objectContaining({ packageRefs: ['PKG-01'] }) })
    );
    expect(POST).toHaveBeenCalledWith(
      '/waybills:merge',
      expect.objectContaining({
        body: expect.objectContaining({ ids: ['waybill-1', 'waybill-2'] }),
      })
    );
  });

  it('fails closed when the detail projection is absent instead of fabricating placeholders', async () => {
    const GET = vi.fn().mockResolvedValue({
      data: {
        data: {
          id: 'waybill-1',
          waybillNo: 'S2505120004',
          state: 'AWAITING_ROUTING',
          allowedActions: [],
          version: 7,
        },
      },
    });
    const adapter = createWaybillApi({ GET, POST: vi.fn() } as never);
    await expect(adapter.get('waybill-1')).rejects.toThrow('WAYBILL_DETAIL_CONTRACT_INCOMPLETE');
  });

  it('fails closed when a batch response has no item-level results', async () => {
    const POST = vi.fn().mockResolvedValue({
      data: { data: { resourceId: 'batch-1', status: 'SUCCEEDED', version: 8 } },
    });
    const adapter = createWaybillApi({ GET: vi.fn(), POST } as never);
    await expect(
      adapter.batch(['waybill-1', 'waybill-2'], 'CANCEL', 7, '客户书面通知取消运输')
    ).rejects.toThrow('WAYBILL_BATCH_RESULT_CONTRACT_INCOMPLETE');
  });
});
