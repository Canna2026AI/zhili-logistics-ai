import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, expect, test, type Page, type Route } from '@playwright/test';
import axe from 'axe-core';

const deviceId = '01JDEVICE00000000000000003';
const warehouseId = '01JWAREHOUSE00000000000001';
const productionUrl = 'http://127.0.0.1:4202';
const meta = { requestId: 'req-pda-e2e', asOf: '2026-07-22T10:00:00.000Z' };
const evidencePng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAAFElEQVR4nGP8z0AaYCJR/aiGUQ1DSAMAQC8BH8HWvCMAAAAASUVORK5CYII=',
  'base64'
);

async function reply(
  route: Route,
  data: unknown,
  status = 200,
  headers: Record<string, string> = {}
) {
  await route.fulfill({
    status,
    contentType: 'application/json',
    headers,
    body: JSON.stringify(data),
  });
}

async function installProductionApi(
  page: Page,
  override?: (route: Route, path: string) => Promise<boolean>
) {
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (override && (await override(route, path))) return;
    if (path.endsWith(':bind')) {
      await reply(route, {
        data: {
          deviceId,
          tenantId: '01JTENANT0000000000000001',
          warehouseId,
          subjectId: '01JSUBJECT0000000000000001',
          permissions: [
            'pda.use',
            'pda.sync',
            'pda.conflict.resolve',
            'lastmile.delivery.execute',
            'lastmile.pod.write',
          ],
          expiresAt: '2099-12-31T23:59:59.000Z',
        },
        meta,
      });
      return;
    }
    if (path.endsWith('/tasks')) {
      await reply(route, {
        data: [
          {
            id: '01JPDATASK0000000000000001',
            type: 'RECEIVE',
            reference: 'S2505120004',
            status: 'READY',
            priority: 'URGENT',
            version: 7,
          },
          {
            id: '01JPDATASK0000000000000002',
            type: 'LAST_MILE_DELIVERY',
            reference: 'LM250722001',
            status: 'LOADED',
            priority: 'HIGH',
            version: 3,
          },
        ],
        meta,
      });
      return;
    }
    await reply(
      route,
      {
        code: 'NOT_FOUND',
        message: `Unhandled PDA fixture route: ${path}`,
        requestId: meta.requestId,
      },
      404
    );
  });
}

async function bind(page: Page) {
  const button = page.getByRole('button', { name: '绑定设备并登录' });
  if (await button.isVisible().catch(() => false)) await button.click();
  await expect(page.getByRole('heading', { name: '任务首页' })).toBeVisible();
}

async function openScanner(page: Page) {
  await page.getByRole('button', { name: '扫描' }).click();
  await expect(page.getByRole('heading', { name: '扫描与作业' })).toBeVisible();
}

async function scan(page: Page, code: string) {
  const input = page.getByLabel('扫描码 / 运单号');
  await input.fill(code);
  await input.press('Enter');
  await expect(
    page
      .getByRole('status')
      .filter({ hasText: code })
      .or(page.getByRole('alert').filter({ hasText: code }))
  ).toBeVisible();
}

async function primePwa(page: Page) {
  await page.evaluate(() => navigator.serviceWorker.ready);
  if (!(await page.evaluate(() => Boolean(navigator.serviceWorker.controller))))
    await page.reload();
  await expect
    .poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)))
    .toBe(true);
  await page.reload();
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const names = await caches.keys();
        const requests = await Promise.all(
          names.map(async (name) => (await caches.open(name)).keys())
        );
        const paths = requests.flat().map((request) => new URL(request.url).pathname);
        return (
          paths.includes('/') &&
          paths.includes('/manifest.webmanifest') &&
          paths.some((path) => path.startsWith('/assets/'))
        );
      })
    )
    .toBe(true);
}

test('persists encrypted event, media and PWA shell across a real browser restart', async () => {
  const profile = mkdtempSync(join(tmpdir(), 'zhili-pda-e2e-'));
  let persistent = await chromium.launchPersistentContext(profile, {
    headless: true,
    viewport: { width: 390, height: 844 },
    locale: 'zh-CN',
    timezoneId: 'Asia/Shanghai',
  });
  const productionApi = async (route: Route, path: string) => {
    if (path.endsWith(`/devices/${deviceId}/media`)) {
      await reply(
        route,
        {
          data: {
            mediaId: 'media-restored',
            eventId: 'event-restored',
            status: 'READY',
            objectRef: 'pda/offline-restart.jpg',
          },
          meta,
        },
        201
      );
      return true;
    }
    if (!path.endsWith('/devices/events:sync')) return false;
    const events = (route.request().postDataJSON() as { events: Array<{ eventId: string }> })
      .events;
    await reply(route, {
      data: events.map((event) => ({
        eventId: event.eventId,
        disposition: 'APPLIED',
        serverVersion: 8,
      })),
      meta,
    });
    return true;
  };
  try {
    const page = persistent.pages()[0] ?? (await persistent.newPage());
    await installProductionApi(page, productionApi);
    await page.goto(productionUrl);
    await primePwa(page);
    await bind(page);
    await persistent.setOffline(true);
    await openScanner(page);
    await page.getByLabel('拍照或选择图片').setInputFiles({
      name: 'offline.png',
      mimeType: 'image/png',
      buffer: evidencePng,
    });
    await scan(page, 'S2505120004');
    await expect(page.getByTestId('pending-count')).toHaveText('1');
    const rawIdb = await page.evaluate(async () => {
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('zhili-pda-offline-v1');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const transaction = database.transaction(['events', 'media']);
      const all = (store: string) =>
        new Promise<unknown[]>((resolve, reject) => {
          const request = transaction.objectStore(store).getAll();
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
      const [events, media] = await Promise.all([all('events'), all('media')]);
      return {
        serialized: JSON.stringify({ events, media }),
        eventCount: events.length,
        mediaCount: media.length,
      };
    });
    expect(rawIdb).toMatchObject({ eventCount: 1, mediaCount: 1 });
    expect(rawIdb.serialized).not.toContain('S2505120004');
    expect(rawIdb.serialized).not.toContain('iVBORw0KGgo');
    await page.reload();
    await expect(page.getByRole('heading', { name: '任务首页' })).toBeVisible();
    await persistent.close();

    persistent = await chromium.launchPersistentContext(profile, {
      headless: true,
      viewport: { width: 390, height: 844 },
      locale: 'zh-CN',
      timezoneId: 'Asia/Shanghai',
    });
    const reopened = persistent.pages()[0] ?? (await persistent.newPage());
    await installProductionApi(reopened, productionApi);
    await persistent.setOffline(true);
    await reopened.goto(productionUrl);
    await expect(reopened.getByRole('heading', { name: '任务首页' })).toBeVisible();
    await expect(reopened.getByTestId('pending-count')).toHaveText('1');
    await reopened.getByRole('button', { name: '离线' }).click();
    await expect(reopened.getByText(/#1 · S2505120004/)).toBeVisible();
    await expect(reopened.getByText('0/1', { exact: true })).toBeVisible();
    await reopened.screenshot({
      path: 'artifacts/e2e/pda/offline-restart-390x844.png',
      fullPage: true,
    });
    await persistent.setOffline(false);
    await reopened.getByRole('button', { name: '立即同步' }).click();
    await expect(reopened.getByTestId('pending-count')).toHaveText('0');
  } finally {
    await persistent.close().catch(() => undefined);
    rmSync(profile, { recursive: true, force: true });
  }
});

test('deduplicates one pending intent locally and accepts a server DUPLICATE disposition', async ({
  page,
}) => {
  const keys: string[] = [];
  await installProductionApi(page, async (route, path) => {
    if (!path.endsWith('/devices/events:sync')) return false;
    keys.push(route.request().headers()['idempotency-key'] ?? '');
    const event = (route.request().postDataJSON() as { events: Array<{ eventId: string }> })
      .events[0]!;
    await reply(route, {
      data: [{ eventId: event.eventId, disposition: 'DUPLICATE', serverVersion: 8 }],
      meta,
    });
    return true;
  });
  await page.goto('/');
  await bind(page);
  await openScanner(page);
  await scan(page, 'DUP-ORIGINAL');
  await scan(page, 'DUP-ORIGINAL');
  await expect(page.getByText(/已在本地队列，未重复写入/)).toBeVisible();
  await expect(page.getByTestId('pending-count')).toHaveText('1');

  await page.getByRole('button', { name: '离线' }).click();
  await page.getByRole('button', { name: '立即同步' }).click();
  await expect(page.getByText(/已处理 1/)).toBeVisible();
  await expect(page.getByTestId('pending-count')).toHaveText('0');
  expect(keys).toHaveLength(1);
});

test('atomically blocks item 201, fails export closed and resumes only the unconfirmed batch', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const batches: number[][] = [];
  let secondBatchFailed = false;
  await installProductionApi(page, async (route, path) => {
    if (!path.endsWith('/devices/events:sync')) return false;
    const events = (
      route.request().postDataJSON() as {
        events: Array<{ eventId: string; localSequence: number }>;
      }
    ).events;
    batches.push(events.map((event) => event.localSequence));
    if (events[0]?.localSequence === 101 && !secondBatchFailed) {
      secondBatchFailed = true;
      await reply(
        route,
        {
          code: 'WEAK_NETWORK',
          message: 'second batch interrupted',
          requestId: meta.requestId,
          remediation: '请重试未确认批次',
          details: {},
        },
        503
      );
      return true;
    }
    await reply(route, {
      data: events.map((event) => ({
        eventId: event.eventId,
        disposition: 'APPLIED',
        serverVersion: 8,
      })),
      meta,
    });
    return true;
  });
  await page.goto('/');
  await bind(page);
  await openScanner(page);
  const input = page.getByLabel('扫描码 / 运单号');
  for (let index = 1; index <= 200; index += 1) {
    await input.fill(`CAP-${String(index).padStart(3, '0')}`);
    await input.press('Enter');
    await expect(page.getByTestId('pending-count')).toHaveText(String(index));
    if (index === 183)
      await expect(page.getByRole('alert').filter({ hasText: '183/200' })).toBeVisible();
  }
  await expect(page.getByRole('alert').filter({ hasText: '200/200' })).toBeVisible();
  await expect(page.getByRole('button', { name: '确认作业' })).toBeDisabled();
  await page.getByRole('button', { name: '离线' }).click();
  await expect(page.getByRole('button', { name: '立即同步' })).toBeEnabled();
  await expect(page.getByRole('button', { name: '导出接管' })).toBeDisabled();
  await expect(page.getByText(/接管导出 PARTIAL/)).toBeVisible();
  await page.screenshot({ path: 'artifacts/e2e/pda/queue-full-390x844.png', fullPage: true });
  await page.getByRole('button', { name: '立即同步' }).click();
  await expect(page.getByTestId('pending-count')).toHaveText('100');
  await expect(page.getByText(/#101 · CAP-101/)).toBeVisible();
  await expect(page.getByText(/#100 · CAP-100/)).toHaveCount(0);
  await page.getByRole('button', { name: '立即同步' }).click();
  await expect(page.getByTestId('pending-count')).toHaveText('0');
  expect(batches.map((batch) => batch.length)).toEqual([100, 100, 100]);
  expect(batches[0]).toEqual(Array.from({ length: 100 }, (_, index) => index + 1));
  expect(batches[1]).toEqual(Array.from({ length: 100 }, (_, index) => index + 101));
  expect(batches[2]).toEqual(batches[1]);
});

test('resumes ordered batches of 100 and handles four dispositions independently', async ({
  page,
}) => {
  await page.goto('/?mock=1');
  await bind(page);
  await openScanner(page);
  for (const code of ['OK-1', 'CONFLICT-KEEP', 'CONFLICT-MANUAL', 'CONFLICT-REAPPLY', 'REJECT-1'])
    await scan(page, code);
  await page.getByRole('button', { name: '离线' }).click();
  await page.getByRole('button', { name: '立即同步' }).click();
  await expect(page.getByText(/应用 1.*冲突 3.*拒绝 1/)).toBeVisible();
  await expect(page.getByText('已拒绝')).toBeVisible();

  for (const [decision, reason] of [
    ['保留服务器', '现场确认服务器数据正确'],
    ['提交人工', '升级主管进行人工复核'],
    ['重新应用本地', '现场单据确认需要重放'],
  ] as const) {
    await page.getByRole('button', { name: '处理冲突' }).first().click();
    await expect(page.getByText(/重新应用将改变库位/)).toBeVisible();
    await page.getByRole('radio', { name: decision }).check();
    await page.getByLabel('处理原因').fill(reason);
    await page.getByRole('button', { name: '提交决策' }).click();
    await expect(page.getByRole('heading', { name: '离线队列' })).toBeVisible();
  }
  await expect(page.getByText('冲突')).toHaveCount(0);
  await expect(page.getByText('已拒绝', { exact: true })).toBeVisible();
  await page.screenshot({
    path: 'artifacts/e2e/pda/conflict-resolved-390x844.png',
    fullPage: true,
  });
});

test('falls back when camera permission or BarcodeDetector is unavailable', async ({
  page,
  context,
}) => {
  await context.clearPermissions();
  await page.goto('/?mock=1');
  await bind(page);
  await openScanner(page);
  await page.getByRole('button', { name: '打开相机扫码' }).click();
  await expect(page.getByRole('alert').filter({ hasText: '已降级' })).toBeVisible();
  const file = page.getByLabel('拍照或选择图片');
  await file.setInputFiles({
    name: 'receipt.jpg',
    mimeType: 'image/jpeg',
    buffer: Buffer.from('photo-evidence'),
  });
  await expect(page.getByText('receipt.jpg')).toBeVisible();
  const input = page.getByLabel('扫描码 / 运单号');
  await input.focus();
  const focusStyle = await input.locator('..').evaluate((element) => {
    const style = getComputedStyle(element);
    return { outlineStyle: style.outlineStyle, outlineColor: style.outlineColor };
  });
  expect(focusStyle.outlineStyle).toBe('solid');
  expect(focusStyle.outlineColor).toBe('rgb(20, 184, 166)');
  await input.fill('MEDIA-SCAN-1');
  const feedbackLatency = await input.evaluate((element) => {
    const start = performance.now();
    return new Promise<number>((resolve) => {
      const observer = new MutationObserver(() => {
        const command = [...document.querySelectorAll('button')].find((candidate) =>
          candidate.textContent?.includes('确认作业')
        ) as HTMLButtonElement | undefined;
        if (command?.disabled) {
          observer.disconnect();
          resolve(performance.now() - start);
        }
      });
      observer.observe(document.body, { attributes: true, childList: true, subtree: true });
      element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });
  });
  expect(feedbackLatency).toBeLessThan(250);
  await expect(page.getByRole('status').filter({ hasText: 'MEDIA-SCAN-1' })).toBeVisible();
  await page.getByRole('button', { name: '离线' }).click();
  await expect(page.getByText('0/1', { exact: true })).toBeVisible();
  await expect(page.getByAltText(/待补传证据/)).toBeVisible();
  await page.getByRole('button', { name: '删除作业并重拍' }).click();
  await expect(page.getByRole('heading', { name: '扫描与作业' })).toBeVisible();
  await expect(page.getByTestId('pending-count')).toHaveText('0');
});

test('completes valid delivery transition and immutable POD evidence in mock mode', async ({
  page,
}) => {
  await page.goto('/?mock=1');
  await bind(page);
  await openScanner(page);
  await page.getByLabel('作业动作').selectOption('LAST_MILE_DELIVER');
  await page.getByLabel('扫描码 / 运单号').fill('LM250722001');
  await page.getByRole('button', { name: '确认作业' }).click();
  await expect(page.getByText(/服务端已确认 派送/)).toBeVisible();

  await page.getByLabel('作业动作').selectOption('CAPTURE_POD');
  await page.getByLabel('签收姓名').fill('陈女士');
  await page.getByLabel('签收时间').fill('2026-07-22T10:00');
  await page
    .getByLabel('拍照或选择图片')
    .setInputFiles({ name: 'pod.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('pod-photo') });
  await page.getByLabel('扫描码 / 运单号').fill('LM250722001');
  await page.getByRole('button', { name: '确认作业' }).click();
  await expect(page.getByText(/POD 已由服务端创建不可变版本/)).toBeVisible();
  await expect(page.getByText(/媒体 1\/1/)).toBeVisible();
});

test('protects queue on 401, blocks warehouse switch and resumes only after reauthentication', async ({
  page,
}) => {
  let authorized = false;
  let bindCalls = 0;
  await installProductionApi(page, async (route, path) => {
    if (path.endsWith(':bind')) {
      bindCalls += 1;
      return false;
    }
    if (!path.endsWith('/devices/events:sync')) return false;
    if (!authorized) {
      await reply(
        route,
        { code: 'SESSION_EXPIRED', message: 'Device session expired', requestId: meta.requestId },
        401
      );
    } else {
      const events = (route.request().postDataJSON() as { events: Array<{ eventId: string }> })
        .events;
      await reply(route, {
        data: events.map((event) => ({
          eventId: event.eventId,
          disposition: 'APPLIED',
          serverVersion: 8,
        })),
        meta,
      });
    }
    return true;
  });
  await page.goto('/');
  await bind(page);
  await openScanner(page);
  await scan(page, 'AUTH-RECOVERY-1');
  await page.getByRole('button', { name: '离线' }).click();
  await page.getByRole('button', { name: '立即同步' }).click();
  await expect(page.getByRole('heading', { name: '设备登录与仓库绑定' })).toBeVisible();
  await expect(page.getByText(/本机还有 1 条未同步数据/)).toBeVisible();

  await page.getByLabel('仓库 ID').fill('01JWAREHOUSE00000000000002');
  await page.getByRole('button', { name: '绑定设备并登录' }).click();
  await expect(page.getByRole('alert').filter({ hasText: '禁止更换用户或仓库' })).toBeVisible();
  expect(bindCalls).toBe(1);

  authorized = true;
  await page.getByLabel('仓库 ID').fill(warehouseId);
  await page.getByRole('button', { name: '绑定设备并登录' }).click();
  await expect(page.getByRole('heading', { name: '任务首页' })).toBeVisible();
  await expect(page.getByTestId('pending-count')).toHaveText('1');
  await page.getByRole('button', { name: '离线' }).click();
  await page.getByRole('button', { name: '立即同步' }).click();
  await expect(page.getByTestId('pending-count')).toHaveText('0');
});

test('retains blobs and retries idempotent multipart media upload after restart', async ({
  page,
}) => {
  let mediaAttempts = 0;
  const mediaKeys: string[] = [];
  await installProductionApi(page, async (route, path) => {
    if (path.endsWith(`/devices/${deviceId}/media`)) {
      mediaAttempts += 1;
      mediaKeys.push(route.request().headers()['idempotency-key'] ?? '');
      if (mediaAttempts === 1)
        await reply(
          route,
          { code: 'WEAK_NETWORK', message: 'upload interrupted', requestId: meta.requestId },
          503
        );
      else
        await reply(
          route,
          {
            data: {
              mediaId: 'server-keeps-client-id',
              eventId: 'evt',
              status: 'READY',
              objectRef: 'pda/photo.jpg',
            },
            meta,
          },
          201
        );
      return true;
    }
    if (path.endsWith('/devices/events:sync')) {
      const events = (route.request().postDataJSON() as { events: Array<{ eventId: string }> })
        .events;
      await reply(route, {
        data: events.map((event) => ({
          eventId: event.eventId,
          disposition: 'APPLIED',
          serverVersion: 8,
        })),
        meta,
      });
      return true;
    }
    return false;
  });
  await page.goto('/');
  await bind(page);
  await openScanner(page);
  await page.getByLabel('拍照或选择图片').setInputFiles({
    name: 'retry.jpg',
    mimeType: 'image/jpeg',
    buffer: Buffer.from('retry-photo-bytes'),
  });
  await scan(page, 'MEDIA-RETRY-1');
  await page.getByRole('button', { name: '离线' }).click();
  await page.getByRole('button', { name: '立即同步' }).click();
  await expect(page.getByTestId('pending-count')).toHaveText('1');
  await expect(page.getByText(/RETRY · 尝试 1/)).toBeVisible();

  await page.reload();
  await expect(page.getByRole('heading', { name: '任务首页' })).toBeVisible();
  await page.getByRole('button', { name: '离线' }).click();
  await expect(page.getByText(/RETRY · 尝试 1/)).toBeVisible();
  await expect(page.getByAltText(/待补传证据/)).toBeVisible();
  await page.getByRole('button', { name: '重试此媒体' }).click();
  await expect(page.getByText(/READY · 尝试 2/)).toBeVisible();
  await page.getByRole('button', { name: '立即同步' }).click();
  await expect(page.getByTestId('pending-count')).toHaveText('0');
  expect(mediaKeys).toHaveLength(2);
  expect(mediaKeys[0]).toBe(mediaKeys[1]);
  expect(mediaKeys[0]).toContain('pda:media:');
});

test('refreshes diff and preserves reason after conflict 409', async ({ page }) => {
  let localEvent: Record<string, unknown> = {};
  let snapshotVersion = 0;
  let resolveAttempts = 0;
  const etags: string[] = [];
  await installProductionApi(page, async (route, path) => {
    if (path.endsWith('/devices/events:sync')) {
      const event = (route.request().postDataJSON() as { events: Array<Record<string, unknown>> })
        .events[0]!;
      localEvent = event;
      await reply(route, {
        data: [
          {
            eventId: event.eventId,
            disposition: 'CONFLICT',
            serverVersion: 9,
            conflictId: '01JCONFLICT000000000000001',
            conflictVersion: 1,
          },
        ],
        meta,
      });
      return true;
    }
    if (path.endsWith('/device-conflicts/01JCONFLICT000000000000001')) {
      snapshotVersion += 1;
      await reply(
        route,
        {
          data: {
            id: '01JCONFLICT000000000000001',
            localEvent,
            serverVersion: 8 + snapshotVersion,
            serverState: { bin: `B-${snapshotVersion}` },
            differences: [
              {
                field: 'bin',
                localValue: 'A-1',
                serverValue: `B-${snapshotVersion}`,
                impact: `新库位版本 ${snapshotVersion}`,
              },
            ],
            status: 'OPEN',
            version: snapshotVersion,
          },
          meta,
        },
        200,
        { ETag: `"${snapshotVersion}"` }
      );
      return true;
    }
    if (path.endsWith('/device-conflicts/01JCONFLICT000000000000001:resolve')) {
      resolveAttempts += 1;
      etags.push(route.request().headers()['if-match'] ?? '');
      if (resolveAttempts === 1)
        await reply(
          route,
          { code: 'VERSION_CONFLICT', message: 'snapshot moved', requestId: meta.requestId },
          409
        );
      else
        await reply(route, {
          data: {
            id: '01JCONFLICT000000000000001',
            localEvent,
            serverVersion: 12,
            serverState: { bin: 'B-4' },
            differences: [],
            status: 'RESOLVED',
            version: 5,
          },
          meta,
        });
      return true;
    }
    return false;
  });
  await page.goto('/');
  await bind(page);
  await openScanner(page);
  await scan(page, 'CONFLICT-409');
  await page.getByRole('button', { name: '离线' }).click();
  await page.getByRole('button', { name: '立即同步' }).click();
  await page.getByRole('button', { name: '处理冲突' }).click();
  const reason = page.getByLabel('处理原因');
  await reason.fill('复核现场单据后再次提交');
  await page.getByRole('button', { name: '提交决策' }).click();
  await expect(page.getByRole('alert').filter({ hasText: '已刷新差异' })).toBeVisible();
  await expect(reason).toHaveValue('复核现场单据后再次提交');
  await expect(page.getByText('新库位版本 3')).toBeVisible();
  await page.getByRole('button', { name: '提交决策' }).click();
  await expect(page.getByRole('heading', { name: '离线队列' })).toBeVisible();
  expect(etags).toEqual(['"2"', '"4"']);
});

test('does not advance delivery state when production transition rejects', async ({ page }) => {
  const ifMatches: string[] = [];
  await installProductionApi(page, async (route, path) => {
    if (path.endsWith('/last-mile/delivery-tasks/01JPDATASK0000000000000002:transition')) {
      ifMatches.push(route.request().headers()['if-match'] ?? '');
      await reply(
        route,
        { code: 'VERSION_CONFLICT', message: 'stale delivery', requestId: meta.requestId },
        409
      );
      return true;
    }
    if (path.endsWith('/devices/events:sync')) {
      const events = (route.request().postDataJSON() as { events: Array<{ eventId: string }> })
        .events;
      await reply(route, {
        data: events.map((event) => ({
          eventId: event.eventId,
          disposition: 'APPLIED',
          serverVersion: 4,
        })),
        meta,
      });
      return true;
    }
    return false;
  });
  await page.goto('/');
  await bind(page);
  await openScanner(page);
  await page.getByLabel('作业动作').selectOption('LAST_MILE_DELIVER');
  await page.getByLabel('扫描码 / 运单号').fill('LM250722001');
  await page.getByRole('button', { name: '确认作业' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'stale delivery' })).toBeVisible();
  await expect(page.getByTestId('pending-count')).toHaveText('1');
  await page.getByRole('button', { name: '确认作业' }).click();
  await expect(page.getByText(/已在本地队列，未重复写入/)).toBeVisible();
  expect(ifMatches).toEqual(['"3"']);
  await page.getByRole('button', { name: '离线' }).click();
  await page.getByRole('button', { name: '立即同步' }).click();
  await expect(page.getByTestId('pending-count')).toHaveText('0');
});

test('starts installed PWA offline without caching authenticated API data and passes mobile axe', async ({
  page,
  context,
}) => {
  await installProductionApi(page);
  const manifestResponse = await page.request.get(`${productionUrl}/manifest.webmanifest`);
  expect(manifestResponse.ok()).toBe(true);
  const manifest = (await manifestResponse.json()) as {
    name: string;
    start_url: string;
    icons: Array<{ src: string; sizes: string }>;
  };
  expect(manifest.name).toBe('智立科技物流AI系统 PDA');
  expect(manifest.start_url).toBe('/?source=pwa');
  expect(manifest.icons.map((icon) => icon.sizes)).toEqual(
    expect.arrayContaining(['192x192', '512x512'])
  );
  for (const icon of manifest.icons)
    expect((await page.request.get(`${productionUrl}${icon.src}`)).ok()).toBe(true);
  await page.goto(productionUrl);
  await primePwa(page);
  await bind(page);
  const cachedUrls = await page.evaluate(async () => {
    const names = await caches.keys();
    const requests = await Promise.all(names.map(async (name) => (await caches.open(name)).keys()));
    return requests.flat().map((request) => request.url);
  });
  expect(cachedUrls.some((url) => new URL(url).pathname.startsWith('/api/'))).toBe(false);
  expect(cachedUrls.some((url) => new URL(url).pathname.startsWith('/assets/'))).toBe(true);
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { name: '任务首页' })).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth
    )
  ).toBe(true);
  await page.addScriptTag({ content: axe.source });
  const violations = await page.evaluate(async () => {
    const result = await (
      globalThis as typeof globalThis & {
        axe: {
          run: (
            root: Document
          ) => Promise<{ violations: Array<{ impact: string | null; id: string }> }>;
        };
      }
    ).axe.run(document);
    return result.violations.filter(
      (item) => item.impact === 'serious' || item.impact === 'critical'
    );
  });
  expect(violations).toEqual([]);
});
