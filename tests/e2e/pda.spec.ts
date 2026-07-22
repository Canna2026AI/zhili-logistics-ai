import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { webcrypto } from 'node:crypto';
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
const receiveReferences = [
  'S2505120004',
  'DUP-ORIGINAL',
  ...Array.from({ length: 200 }, (_, index) => `CAP-${String(index + 1).padStart(3, '0')}`),
  'AUTH-RECOVERY-1',
  'MEDIA-RETRY-1',
  'CONFLICT-409',
  'TAKEOVER-1',
];

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

function multipartPart(body: Buffer, name: string) {
  const marker = Buffer.from(`name="${name}"`);
  const markerIndex = body.indexOf(marker);
  if (markerIndex < 0) throw new Error(`multipart field ${name} is missing`);
  const contentStartMarker = Buffer.from('\r\n\r\n');
  const contentStart = body.indexOf(contentStartMarker, markerIndex);
  if (contentStart < 0) throw new Error(`multipart field ${name} has no content`);
  const start = contentStart + contentStartMarker.length;
  const end = body.indexOf(Buffer.from('\r\n--'), start);
  if (end < 0) throw new Error(`multipart field ${name} has no boundary`);
  return body.subarray(start, end);
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
    if (path.endsWith('/tasks')) {
      await reply(route, {
        data: [
          ...receiveReferences.map((reference, index) => ({
            id: `01JPDARECV${String(index + 1).padStart(16, '0')}`,
            type: 'RECEIVE',
            reference,
            status: 'READY',
            priority: index === 0 ? 'URGENT' : 'NORMAL',
            version: 7,
          })),
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
            status: 'UPLOADED',
            objectRef: 'pda/offline-restart.jpg',
          },
          meta,
        },
        201
      );
      return true;
    }
    if (!path.endsWith('/devices/events:sync')) return false;
    const events = (
      route.request().postDataJSON() as {
        events: Array<{ eventId: string; mediaRefs: string[] }>;
      }
    ).events;
    await reply(route, {
      data: events.map((event) => ({
        eventId: event.eventId,
        disposition: 'APPLIED',
        claimedMediaRefs: event.mediaRefs,
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
    const event = (
      route.request().postDataJSON() as {
        events: Array<{ eventId: string; mediaRefs: string[] }>;
      }
    ).events[0]!;
    await reply(route, {
      data: [
        {
          eventId: event.eventId,
          disposition: 'DUPLICATE',
          claimedMediaRefs: event.mediaRefs,
          serverVersion: 8,
        },
      ],
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

test('atomically blocks item 201, gates takeover by reason and resumes only the unconfirmed batch', async ({
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
        claimedMediaRefs: [],
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
  await expect(page.getByLabel('管理员接管原因')).toBeVisible();
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

test('uploads an encrypted takeover package, clears on VERIFIED and then allows warehouse switch', async ({
  page,
}) => {
  const keyPair = await webcrypto.subtle.generateKey(
    {
      name: 'RSA-OAEP',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    true,
    ['wrapKey', 'unwrapKey']
  );
  const publicJwk = await webcrypto.subtle.exportKey('jwk', keyPair.publicKey);
  const authorizationId = '01JTAKEOVERAUTH00000000001';
  let authorizationBody: Record<string, unknown> | undefined;
  let encryptedMultipart = Buffer.alloc(0);
  const takeoverKeys: string[] = [];
  let activeWarehouse = warehouseId;
  await installProductionApi(page, async (route, path) => {
    const request = route.request();
    if (path.endsWith(':bind')) {
      const body = request.postDataJSON() as { warehouseId: string; subjectId: string };
      activeWarehouse = body.warehouseId;
      await reply(route, {
        data: {
          deviceId,
          tenantId: '01JTENANT0000000000000001',
          warehouseId: body.warehouseId,
          subjectId: body.subjectId,
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
      return true;
    }
    if (path.endsWith(`/devices/${deviceId}/takeover-exports:authorize`)) {
      takeoverKeys.push(request.headers()['idempotency-key'] ?? '');
      authorizationBody = request.postDataJSON() as Record<string, unknown>;
      await reply(
        route,
        {
          data: {
            authorizationId,
            deviceId,
            scope: {
              tenantId: '01JTENANT0000000000000001',
              warehouseId: activeWarehouse,
              subjectId: '01JSUBJECT0000000000000001',
              deviceId,
            },
            manifestHash: authorizationBody.manifestHash,
            eventCount: authorizationBody.eventCount,
            mediaCount: authorizationBody.mediaCount,
            expiresAt: '2099-12-31T23:59:59.000Z',
            keyEncryptionAlgorithm: 'RSA-OAEP-256',
            contentEncryptionAlgorithm: 'A256GCM',
            publicKeyJwk: {
              kty: 'RSA',
              kid: 'e2e-takeover-key',
              use: 'enc',
              alg: 'RSA-OAEP-256',
              key_ops: ['wrapKey'],
              n: publicJwk.n,
              e: publicJwk.e,
            },
            maxCiphertextBytes: 5_000_000,
            status: 'AUTHORIZED',
          },
          meta,
        },
        201
      );
      return true;
    }
    if (path.endsWith(`/devices/${deviceId}/takeover-exports/${authorizationId}`)) {
      takeoverKeys.push(request.headers()['idempotency-key'] ?? '');
      encryptedMultipart = request.postDataBuffer() ?? Buffer.alloc(0);
      const field = (name: string) => multipartPart(encryptedMultipart, name).toString('utf8');
      await reply(
        route,
        {
          data: {
            exportId: '01JTAKEOVEREXPORT0000000001',
            authorizationId,
            deviceId,
            scope: {
              tenantId: '01JTENANT0000000000000001',
              warehouseId: activeWarehouse,
              subjectId: '01JSUBJECT0000000000000001',
              deviceId,
            },
            manifestHash: field('manifestHash'),
            ciphertextHash: field('ciphertextHash'),
            eventCount: 1,
            mediaCount: 1,
            checksumAlgorithm: 'SHA-256',
            status: 'VERIFIED',
            receivedAt: '2026-07-22T12:00:00.000Z',
            verifiedAt: '2026-07-22T12:00:01.000Z',
          },
          meta,
        },
        201
      );
      return true;
    }
    return false;
  });

  await page.goto(productionUrl);
  await bind(page);
  await openScanner(page);
  await page.getByLabel('拍照或选择图片').setInputFiles({
    name: 'takeover.jpg',
    mimeType: 'image/jpeg',
    buffer: Buffer.from('takeover-photo-secret'),
  });
  await scan(page, 'TAKEOVER-1');
  await expect(page.getByTestId('pending-count')).toHaveText('1');
  await page.getByRole('button', { name: '离线' }).click();
  await page.getByLabel('管理员接管原因').fill('设备损坏，由当班主管接管');
  await page.getByRole('button', { name: '导出接管' }).click();
  await expect(page.getByText(/接管导出已验证/)).toBeVisible();
  await expect(page.getByTestId('pending-count')).toHaveText('0');

  expect(authorizationBody).toMatchObject({
    reason: '设备损坏，由当班主管接管',
    eventCount: 1,
    mediaCount: 1,
  });
  expect(String(authorizationBody?.manifestHash)).toMatch(/^[a-f0-9]{64}$/);
  expect(takeoverKeys).toHaveLength(2);
  expect(takeoverKeys.every((key) => key.startsWith('pda:takeover:'))).toBe(true);
  expect(encryptedMultipart.toString('latin1')).toContain('name="ciphertext"');
  expect(encryptedMultipart.toString('latin1')).toContain('name="wrappedKey"');
  expect(encryptedMultipart.toString('utf8')).not.toContain('TAKEOVER-1');
  expect(encryptedMultipart.toString('utf8')).not.toContain('takeover-photo-secret');

  const unwrappedKey = await webcrypto.subtle.unwrapKey(
    'raw',
    multipartPart(encryptedMultipart, 'wrappedKey'),
    keyPair.privateKey,
    { name: 'RSA-OAEP' },
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt']
  );
  const archive = await webcrypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: Buffer.from(multipartPart(encryptedMultipart, 'iv').toString('utf8'), 'base64'),
    },
    unwrappedKey,
    multipartPart(encryptedMultipart, 'ciphertext')
  );
  const plaintextArchive = Buffer.from(archive).toString('utf8');
  expect(plaintextArchive).toContain('TAKEOVER-1');
  expect(plaintextArchive).toContain(Buffer.from('takeover-photo-secret').toString('base64'));

  await page.reload();
  await expect(page.getByRole('heading', { name: '任务首页' })).toBeVisible();
  await expect(page.getByTestId('pending-count')).toHaveText('0');
  await page.getByRole('button', { name: '离线' }).click();
  await expect(page.getByText('队列已清空')).toBeVisible();

  await page.getByRole('button', { name: '我的' }).click();
  await page.getByRole('button', { name: '重新认证' }).click();
  await page.getByLabel('仓库 ID').fill('01JWAREHOUSE00000000000002');
  await page.getByRole('button', { name: '绑定设备并登录' }).click();
  await expect(page.getByRole('heading', { name: '任务首页' })).toBeVisible();
  await expect(page.getByText(/00000002/).first()).toBeVisible();
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
  await expect(page.getByText(/媒体 0\/0/)).toBeVisible();
});

test('runs the production PALLETIZED to POD lifecycle from authoritative receipts', async ({
  page,
}) => {
  const taskId = '01JDELIVERYLIFECYCLE0000001';
  const transitions: Array<{
    ifMatch: string;
    body: {
      deviceEventId: string;
      targetStatus: string;
      mediaRefs: string[];
      scanEvidence: Record<string, unknown>;
    };
  }> = [];
  let podRequest:
    | {
        ifMatch: string;
        body: { deviceEventId: string; evidenceRefs: string[]; recipientName: string };
      }
    | undefined;
  let uploadedEventId = '';
  await installProductionApi(page, async (route, path) => {
    const request = route.request();
    if (path.endsWith(`/devices/${deviceId}/tasks`)) {
      await reply(route, {
        data: [
          {
            id: taskId,
            type: 'LAST_MILE_DELIVERY',
            reference: 'LM-LIFECYCLE',
            status: 'PLANNED',
            priority: 'URGENT',
            version: 7,
          },
        ],
        meta,
      });
      return true;
    }
    if (path.endsWith(`/last-mile/delivery-tasks/${taskId}:transition`)) {
      const body = request.postDataJSON() as (typeof transitions)[number]['body'];
      const ifMatch = request.headers()['if-match'] ?? '';
      transitions.push({ ifMatch, body });
      await reply(route, {
        data: {
          deviceEventId: body.deviceEventId,
          disposition: 'APPLIED',
          deliveryTask: {
            id: taskId,
            taskNo: 'LM-LIFECYCLE',
            status: body.targetStatus,
            waybillCount: 1,
            version: Number(ifMatch.replaceAll('"', '')) + 1,
          },
          claimedMediaRefs: body.mediaRefs,
        },
        meta,
      });
      return true;
    }
    if (path.endsWith(`/devices/${deviceId}/media`)) {
      const postData = request.postData() ?? '';
      uploadedEventId = /name="eventId"\r?\n\r?\n([^\r\n]+)/.exec(postData)?.[1]?.trim() ?? '';
      const mediaId = /name="mediaId"\r?\n\r?\n([^\r\n]+)/.exec(postData)?.[1]?.trim() ?? '';
      await reply(
        route,
        {
          data: {
            mediaId,
            eventId: uploadedEventId,
            status: 'UPLOADED',
            objectRef: `reservation/${mediaId}`,
          },
          meta,
        },
        201
      );
      return true;
    }
    if (path.endsWith(`/last-mile/delivery-tasks/${taskId}/proof-of-delivery`)) {
      const body = request.postDataJSON() as NonNullable<typeof podRequest>['body'];
      podRequest = { ifMatch: request.headers()['if-match'] ?? '', body };
      await reply(
        route,
        {
          data: {
            deviceEventId: body.deviceEventId,
            disposition: 'APPLIED',
            deliveryTask: {
              id: taskId,
              taskNo: 'LM-LIFECYCLE',
              status: 'COMPLETED',
              waybillCount: 1,
              version: 42,
            },
            proofOfDelivery: {
              id: '01JPODLIFECYCLE00000000001',
              deliveryTaskId: taskId,
              versionNo: 1,
              recipientName: body.recipientName,
              signedAt: '2026-07-22T10:00:00.000Z',
              evidenceRefs: body.evidenceRefs,
            },
            claimedMediaRefs: body.evidenceRefs,
          },
          meta,
        },
        201
      );
      return true;
    }
    return false;
  });

  await page.goto(productionUrl);
  await bind(page);
  await page.getByRole('button', { name: /LM-LIFECYCLE/ }).click();

  await page.getByLabel('作业动作').selectOption('LAST_MILE_PALLETIZE');
  await page.getByLabel('托盘码').fill('PALLET-9');
  await page.getByRole('button', { name: '确认作业' }).click();
  await expect(page.getByTestId('selected-task')).toContainText('PALLETIZED · v8');

  await page.getByLabel('作业动作').selectOption('LAST_MILE_LOAD');
  await page.getByLabel('车辆码').fill('VEHICLE-2');
  await page.getByRole('button', { name: '确认作业' }).click();
  await expect(page.getByTestId('selected-task')).toContainText('LOADED · v9');

  await page.getByLabel('作业动作').selectOption('LAST_MILE_DELIVER');
  await page.getByRole('button', { name: '确认作业' }).click();
  await expect(page.getByTestId('selected-task')).toContainText('OUT_FOR_DELIVERY · v10');

  await page.getByLabel('作业动作').selectOption('CAPTURE_POD');
  await page.getByLabel('签收姓名').fill('陈女士');
  await page.getByLabel('签收时间').fill('2026-07-22T10:00');
  await page.getByLabel('拍照或选择图片').setInputFiles({
    name: 'pod.jpg',
    mimeType: 'image/jpeg',
    buffer: Buffer.from('production-pod-photo'),
  });
  await page.getByRole('button', { name: '确认作业' }).click();
  await expect(page.getByTestId('selected-task')).toContainText('COMPLETED · v42');
  await expect(page.getByTestId('pending-count')).toHaveText('0');
  await expect(page.getByText(/媒体 0\/0/)).toBeVisible();

  expect(transitions.map((item) => item.ifMatch)).toEqual(['"7"', '"8"', '"9"']);
  expect(transitions.map((item) => item.body.targetStatus)).toEqual([
    'PALLETIZED',
    'LOADED',
    'OUT_FOR_DELIVERY',
  ]);
  expect(transitions[0]!.body.scanEvidence).toMatchObject({
    scannedCode: 'LM-LIFECYCLE',
    palletId: 'PALLET-9',
  });
  expect(transitions[1]!.body.scanEvidence).toMatchObject({
    scannedCode: 'LM-LIFECYCLE',
    vehicleId: 'VEHICLE-2',
  });
  expect(podRequest?.ifMatch).toBe('"10"');
  expect(podRequest?.body.deviceEventId).toBe(uploadedEventId);
  expect(podRequest?.body.evidenceRefs).toHaveLength(1);
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
      const events = (
        route.request().postDataJSON() as {
          events: Array<{ eventId: string; mediaRefs: string[] }>;
        }
      ).events;
      await reply(route, {
        data: events.map((event) => ({
          eventId: event.eventId,
          disposition: 'APPLIED',
          claimedMediaRefs: event.mediaRefs,
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
              status: 'UPLOADED',
              objectRef: 'pda/photo.jpg',
            },
            meta,
          },
          201
        );
      return true;
    }
    if (path.endsWith('/devices/events:sync')) {
      const events = (
        route.request().postDataJSON() as {
          events: Array<{ eventId: string; mediaRefs: string[] }>;
        }
      ).events;
      await reply(route, {
        data: events.map((event) => ({
          eventId: event.eventId,
          disposition: 'APPLIED',
          claimedMediaRefs: event.mediaRefs,
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
  await expect(page.getByText(/UPLOADED · 尝试 2/)).toBeVisible();
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
            claimedMediaRefs: [],
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
          {
            code: 'STALE_VERSION',
            message: 'snapshot moved',
            requestId: 'req-conflict-envelope',
            remediation: '复核最新 ETag 后再次提交',
            details: [{ field: 'If-Match', reason: 'expected version 4' }],
          },
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
  await expect(page.getByRole('alert')).toContainText('req-conflict-envelope');
  await expect(page.getByRole('alert')).toContainText('复核最新 ETag 后再次提交');
  await expect(page.getByRole('alert')).toContainText('expected version 4');
  await expect(reason).toHaveValue('复核现场单据后再次提交');
  await expect(page.getByText('新库位版本 3')).toBeVisible();
  await page.getByRole('button', { name: '提交决策' }).click();
  await expect(page.getByRole('heading', { name: '离线队列' })).toBeVisible();
  expect(etags).toEqual(['"2"', '"4"']);
});

test('does not advance delivery state when production transition rejects', async ({ page }) => {
  const ifMatches: string[] = [];
  let stale = false;
  await installProductionApi(page, async (route, path) => {
    if (stale && path.endsWith(`/devices/${deviceId}/tasks`)) {
      await reply(route, {
        data: [
          {
            id: '01JPDATASK0000000000000002',
            type: 'LAST_MILE_DELIVERY',
            reference: 'LM250722001',
            status: 'OUT_FOR_DELIVERY',
            priority: 'HIGH',
            version: 4,
          },
        ],
        meta,
      });
      return true;
    }
    if (path.endsWith('/last-mile/delivery-tasks/01JPDATASK0000000000000002:transition')) {
      ifMatches.push(route.request().headers()['if-match'] ?? '');
      stale = true;
      await reply(
        route,
        {
          code: 'STALE_VERSION',
          message: 'stale delivery',
          requestId: 'req-delivery-409',
          remediation: '复核最新派送状态',
          details: [{ field: 'If-Match', reason: 'expected version 4' }],
        },
        409
      );
      return true;
    }
    if (path.endsWith('/devices/events:sync')) {
      const events = (
        route.request().postDataJSON() as {
          events: Array<{ eventId: string; mediaRefs: string[] }>;
        }
      ).events;
      await reply(route, {
        data: events.map((event) => ({
          eventId: event.eventId,
          disposition: 'APPLIED',
          claimedMediaRefs: event.mediaRefs,
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
  const alert = page.getByRole('alert').filter({ hasText: 'stale delivery' });
  await expect(alert).toBeVisible();
  await expect(alert).toContainText('已刷新服务器任务快照');
  await expect(alert).toContainText('复核最新派送状态');
  await expect(alert).toContainText('expected version 4');
  await expect(alert).toContainText('req-delivery-409');
  await expect(page.getByTestId('pending-count')).toHaveText('1');
  await page.getByRole('button', { name: '任务' }).click();
  await page.getByRole('button', { name: /LM250722001/ }).click();
  await expect(page.getByTestId('selected-task')).toContainText('OUT_FOR_DELIVERY · v4');
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
