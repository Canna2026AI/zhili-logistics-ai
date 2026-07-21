import { describe, expect, it, vi } from 'vitest';
import { createWaybillApi } from '../api/waybill-api';

describe('waybill OpenAPI adapter', () => {
  it('calls generated paths with version and idempotency headers', async () => {
    const GET = vi.fn().mockResolvedValue({ data: { data: { waybillNo: 'S2505120004' } } });
    const POST = vi.fn().mockResolvedValue({ data: { data: { status: 'SUCCEEDED' } } });
    const adapter = createWaybillApi({ GET, POST } as never, () => 'idempotency-1');
    await adapter.get('waybill-1');
    await adapter.submit('waybill-1', 7);
    await adapter.createLabel('waybill-1', 7, 'A4');
    await adapter.batch(['waybill-1'], 'CANCEL', 7, '客户书面申请取消');
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
  });
});
