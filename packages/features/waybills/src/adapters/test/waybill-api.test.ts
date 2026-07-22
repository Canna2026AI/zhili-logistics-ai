import { describe, expect, it, vi } from 'vitest';
import { createWaybillApi } from '../api/waybill-api';

const waybillProjection = {
  id: 'waybill-1',
  waybillNo: 'S2505120004',
  masterNo: 'HBL2505120004',
  customerName: '深圳鑫源贸易有限公司',
  customerCode: 'CUST00256',
  contactName: '王志强',
  contactPhone: '139 2654 8800',
  fieldPolicy: {
    customerName: { access: 'READ', copyAllowed: true, exportAllowed: true },
    customerCode: { access: 'READ', copyAllowed: true, exportAllowed: true },
    contactName: { access: 'READ', copyAllowed: true, exportAllowed: true },
    contactPhone: { access: 'READ', copyAllowed: true, exportAllowed: true },
  },
  route: 'CN-SZX → US-LAX',
  service: 'DHL Express Worldwide',
  transport: 'SEA',
  pieces: 18,
  forecastWeightKg: '122.00',
  actualWeightKg: '123.50',
  volumeM3: '0.48',
  createdAt: '2025-05-12 08:16',
  state: 'RECEIVED',
  version: 8,
  branch: '深圳分公司',
  timeline: ['待分货 · 深圳仓库'],
  allowedActions: [],
};

describe('waybill OpenAPI adapter', () => {
  it('calls generated paths with version and idempotency headers', async () => {
    const GET = vi.fn().mockResolvedValue({
      data: { data: waybillProjection },
    });
    const POST = vi.fn(async (path: string) => {
      if (path === '/waybills/{waybillId}:submit') return { data: { data: waybillProjection } };
      if (path === '/waybills/{waybillId}/label-jobs')
        return {
          data: {
            data: {
              labelJobId: 'label-1',
              waybillId: 'waybill-1',
              latestWaybillVersion: 8,
              status: 'QUEUED',
              format: 'A4',
              createdAt: '2026-07-22T08:00:00.000Z',
            },
          },
        };
      if (path === '/waybills:batch-command')
        return {
          data: {
            data: {
              command: 'CANCEL',
              orderPreserved: true,
              outcomes: [{ waybillId: 'waybill-1', disposition: 'SUCCEEDED', latestVersion: 8 }],
            },
          },
        };
      if (path === '/waybills/{waybillId}:renumber')
        return {
          data: {
            data: {
              waybillId: 'waybill-1',
              previousWaybillNo: 'S2505120004',
              newWaybillNo: 'S2505129999',
              latestVersion: 8,
            },
          },
        };
      if (path === '/waybills:split')
        return {
          data: {
            data: {
              source: {
                waybillId: 'waybill-1',
                waybillNo: 'S2505120004',
                version: 8,
                packageRefs: [],
              },
              children: [
                {
                  waybillId: 'waybill-3',
                  waybillNo: 'S2505120004-1',
                  version: 1,
                  packageRefs: ['PKG-01'],
                },
                {
                  waybillId: 'waybill-4',
                  waybillNo: 'S2505120004-2',
                  version: 1,
                  packageRefs: [],
                },
              ],
            },
          },
        };
      return {
        data: {
          data: {
            sources: [
              { waybillId: 'waybill-1', waybillNo: 'S1', version: 8, packageRefs: [] },
              { waybillId: 'waybill-2', waybillNo: 'S2', version: 9, packageRefs: [] },
            ],
            merged: {
              waybillId: 'waybill-3',
              waybillNo: 'S3',
              version: 1,
              packageRefs: [],
            },
          },
        },
      };
    });
    const adapter = createWaybillApi({ GET, POST } as never, () => 'idempotency-1');
    await adapter.get('waybill-1');
    await adapter.submit('waybill-1', 7);
    await adapter.createLabel('waybill-1', 7, 'A4');
    await adapter.batch(
      [{ waybillId: 'waybill-1', expectedVersion: 7 }],
      'CANCEL',
      '客户书面申请取消'
    );
    await adapter.renumber('waybill-1', 7, 'S2505129999', '客户要求修正运单号');
    await adapter.split('waybill-1', 7, ['PKG-01'], '包裹需分开运输');
    await adapter.merge(
      [
        { waybillId: 'waybill-1', expectedVersion: 7 },
        { waybillId: 'waybill-2', expectedVersion: 8 },
      ],
      '同路线运单合并'
    );
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
      expect.objectContaining({
        params: { header: { 'Idempotency-Key': 'idempotency-1' } },
        body: expect.objectContaining({ command: 'CANCEL' }),
      })
    );
    expect(POST).toHaveBeenCalledWith(
      '/waybills/{waybillId}:renumber',
      expect.objectContaining({ body: expect.objectContaining({ newWaybillNo: 'S2505129999' }) })
    );
    expect(POST).toHaveBeenCalledWith(
      '/waybills:split',
      expect.objectContaining({
        params: { header: { 'Idempotency-Key': 'idempotency-1' } },
        body: expect.objectContaining({ packageRefs: ['PKG-01'], expectedVersion: 7 }),
      })
    );
    expect(POST).toHaveBeenCalledWith(
      '/waybills:merge',
      expect.objectContaining({
        params: { header: { 'Idempotency-Key': 'idempotency-1' } },
        body: expect.objectContaining({
          items: [
            { waybillId: 'waybill-1', expectedVersion: 7 },
            { waybillId: 'waybill-2', expectedVersion: 8 },
          ],
        }),
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
      adapter.batch(
        [
          { waybillId: 'waybill-1', expectedVersion: 7 },
          { waybillId: 'waybill-2', expectedVersion: 7 },
        ],
        'CANCEL',
        '客户书面通知取消运输'
      )
    ).rejects.toThrow('WAYBILL_BATCH_RESULT_CONTRACT_INCOMPLETE');
  });

  it('preserves server MASK values and DENY decisions without reconstructing PII', async () => {
    const GET = vi.fn().mockResolvedValue({
      data: {
        data: {
          id: 'waybill-1',
          waybillNo: 'S2505120004',
          masterNo: null,
          customerName: '深***公司',
          contactName: '王**',
          contactPhone: '139 **** 8800',
          fieldPolicy: {
            customerName: { access: 'MASK', copyAllowed: false, exportAllowed: false },
            customerCode: { access: 'DENY', copyAllowed: false, exportAllowed: false },
            contactName: { access: 'MASK', copyAllowed: false, exportAllowed: false },
            contactPhone: { access: 'MASK', copyAllowed: false, exportAllowed: false },
          },
          route: 'CN-SZX → US-LAX',
          service: 'DHL Express Worldwide',
          transport: 'EXPRESS',
          pieces: 18,
          forecastWeightKg: '122.00',
          actualWeightKg: null,
          volumeM3: null,
          createdAt: '2026-07-22T08:16:00.000Z',
          state: 'RECEIVED',
          version: 7,
          branch: '深圳分公司',
          timeline: ['待分货 · 深圳仓库'],
          allowedActions: [],
        },
      },
    });
    const detail = await createWaybillApi({ GET, POST: vi.fn() } as never).get('waybill-1');
    expect(detail.customer).toBe('深***公司');
    expect(detail.customerCode).toBe('');
    expect(detail.fieldDecisions).toMatchObject({
      customer: { access: 'MASK' },
      customerCode: { access: 'DENY' },
    });
  });

  it('consumes ordered authoritative batch outcomes and sends per-item versions', async () => {
    const POST = vi.fn().mockResolvedValue({
      data: {
        data: {
          command: 'CANCEL',
          orderPreserved: true,
          outcomes: [
            { waybillId: 'waybill-1', disposition: 'SUCCEEDED', latestVersion: 8 },
            {
              waybillId: 'waybill-2',
              disposition: 'FAILED',
              latestVersion: 9,
              error: {
                code: 'STALE_VERSION',
                message: '版本已变化',
                remediation: '刷新后重试',
              },
            },
          ],
        },
      },
    });
    const adapter = createWaybillApi({ GET: vi.fn(), POST } as never, () => 'idem-batch');
    await expect(
      adapter.batch(
        [
          { waybillId: 'waybill-1', expectedVersion: 7 },
          { waybillId: 'waybill-2', expectedVersion: 8 },
        ] as never,
        'CANCEL',
        '客户书面通知取消运输'
      )
    ).resolves.toMatchObject({
      succeeded: ['waybill-1'],
      failed: [{ id: 'waybill-2', reason: '版本已变化', latestVersion: 9 }],
    });
    expect(POST).toHaveBeenCalledWith('/waybills:batch-command', {
      params: { header: { 'Idempotency-Key': 'idem-batch' } },
      body: {
        items: [
          { waybillId: 'waybill-1', expectedVersion: 7 },
          { waybillId: 'waybill-2', expectedVersion: 8 },
        ],
        command: 'CANCEL',
        reason: '客户书面通知取消运输',
      },
    });
  });

  it('never falls back to a local version when an authoritative response is incomplete', async () => {
    const POST = vi.fn().mockResolvedValue({ data: { data: {} } });
    const adapter = createWaybillApi({ GET: vi.fn(), POST } as never);
    await expect(adapter.submit('waybill-1', 7)).rejects.toThrow(
      'WAYBILL_COMMAND_RESULT_CONTRACT_INCOMPLETE'
    );
    await expect(adapter.createLabel('waybill-1', 7, 'A4')).rejects.toThrow(
      'LABEL_JOB_RESULT_CONTRACT_INCOMPLETE'
    );
    await expect(
      adapter.renumber('waybill-1', 7, 'S2505129999', '客户要求修正运单号')
    ).rejects.toThrow('WAYBILL_RENUMBER_RESULT_CONTRACT_INCOMPLETE');
    await expect(adapter.split('waybill-1', 7, ['PKG-01'], '包裹需分开运输')).rejects.toThrow(
      'WAYBILL_SPLIT_RESULT_CONTRACT_INCOMPLETE'
    );
    await expect(
      adapter.merge(
        [
          { waybillId: 'waybill-1', expectedVersion: 7 },
          { waybillId: 'waybill-2', expectedVersion: 8 },
        ] as never,
        '同路线运单合并'
      )
    ).rejects.toThrow('WAYBILL_MERGE_RESULT_CONTRACT_INCOMPLETE');
  });
});
