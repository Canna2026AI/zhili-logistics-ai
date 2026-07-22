import { expect, test, type Route } from '@playwright/test';

const productionUrl = 'http://127.0.0.1:4202';
const deviceId = '01JDEVICE00000000000000003';
const secondTaskId = '01JPDATASK0000000000000002';
const meta = { requestId: 'req-pda-task-safety', asOf: '2026-07-22T10:00:00.000Z' };

async function reply(route: Route, data: unknown, status = 200) {
  await route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(data),
  });
}

test('clicking the second same-type task transitions only its exact production resource', async ({
  page,
}) => {
  const transitions: Array<{
    url: string;
    ifMatch?: string;
    body: Record<string, unknown>;
  }> = [];
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path.endsWith(':bind')) {
      await reply(route, {
        data: {
          deviceId,
          tenantId: '01JTENANT0000000000000001',
          warehouseId: '01JWAREHOUSE00000000000001',
          subjectId: '01JSUBJECT0000000000000001',
          permissions: [
            'pda.use',
            'pda.sync',
            'pda.conflict.resolve',
            'pda.takeover.export',
            'lastmile.delivery.execute',
            'lastmile.pod.write',
          ],
          expiresAt: '2099-12-31T23:59:59.000Z',
        },
        meta,
      });
      return;
    }
    if (path.endsWith(`/devices/${deviceId}/tasks`)) {
      await reply(route, {
        data: [
          {
            id: '01JPDATASK0000000000000001',
            type: 'LAST_MILE_DELIVERY',
            reference: 'LM-FIRST',
            status: 'LOADED',
            priority: 'HIGH',
            version: 4,
          },
          {
            id: secondTaskId,
            type: 'LAST_MILE_DELIVERY',
            reference: 'LM-SECOND',
            status: 'LOADED',
            priority: 'URGENT',
            version: 9,
          },
        ],
        meta,
      });
      return;
    }
    if (path.includes('/last-mile/delivery-tasks/') && path.endsWith(':transition')) {
      const body = request.postDataJSON() as Record<string, unknown>;
      transitions.push({
        url: request.url(),
        ifMatch: request.headers()['if-match'],
        body,
      });
      if (!path.endsWith(`/last-mile/delivery-tasks/${secondTaskId}:transition`)) {
        await reply(
          route,
          { code: 'WRONG_TASK', message: 'transition targeted the wrong task', requestId: 'wrong' },
          409
        );
        return;
      }
      await reply(route, {
        data: {
          deviceEventId: body.deviceEventId,
          disposition: 'APPLIED',
          deliveryTask: {
            id: secondTaskId,
            taskNo: 'LM-SECOND',
            status: 'OUT_FOR_DELIVERY',
            waybillCount: 1,
            version: 10,
          },
          claimedMediaRefs: [],
        },
        meta,
      });
      return;
    }
    await reply(
      route,
      { code: 'UNHANDLED', message: `Unhandled PDA route: ${path}`, requestId: 'unhandled' },
      404
    );
  });

  await page.goto(productionUrl);
  await page.getByRole('button', { name: '绑定设备并登录' }).click();
  await expect(page.getByRole('heading', { name: '任务首页' })).toBeVisible();

  await page.getByRole('button', { name: /LM-SECOND/ }).click();
  await expect(page.getByTestId('selected-task')).toContainText('LM-SECOND');
  await expect(page.getByTestId('selected-task')).toContainText(secondTaskId);
  await expect(page.getByTestId('selected-task')).toContainText('LOADED · v9');
  await page.getByLabel('作业动作').selectOption('LAST_MILE_DELIVER');
  await page.getByRole('button', { name: '确认作业' }).click();
  await expect(page.getByRole('status').filter({ hasText: '服务端已确认' })).toBeVisible();

  expect(transitions).toHaveLength(1);
  expect(new URL(transitions[0]!.url).pathname).toBe(
    `/api/v1/last-mile/delivery-tasks/${secondTaskId}:transition`
  );
  expect(transitions[0]!.ifMatch).toBe('"9"');
  expect(transitions[0]!.body).toMatchObject({
    deviceEventId: expect.stringMatching(/^01J/),
    targetStatus: 'OUT_FOR_DELIVERY',
    mediaRefs: [],
    scanEvidence: {
      scannedCode: 'LM-SECOND',
    },
  });
  await expect(page.getByTestId('selected-task')).toContainText('OUT_FOR_DELIVERY · v10');

  await page.getByRole('button', { name: '任务' }).click();
  await expect(page.getByRole('button', { name: /LM-FIRST/ })).toContainText('LOADED');
  await expect(page.getByRole('button', { name: /LM-SECOND/ })).toContainText('OUT_FOR_DELIVERY');
});
