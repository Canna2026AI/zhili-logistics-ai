// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './app';
import { MemoryQueueStore } from './offline/queue-store';
import { MemoryPdaPort } from './ports/memory-pda-port';
import { OfflineQueue } from './offline/offline-queue';
import { MediaQueue } from './offline/media-queue';
import { SessionGuard, type LocalDeviceSession } from './session/session-guard';
import type { DeviceTask } from './domain/types';

const bind = async () => {
  await userEvent.click(await screen.findByRole('button', { name: '绑定设备并登录' }));
  await screen.findByRole('heading', { name: '任务首页' });
};

describe('PDA application', () => {
  afterEach(cleanup);
  beforeEach(() => {
    window.history.replaceState({}, '', '/?mock=1');
    Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: false });
  });

  it('binds a device, loads scoped tasks, queues an Enter scan and restores it after reload', async () => {
    const store = new MemoryQueueStore();
    const port = new MemoryPdaPort();
    const first = render(<App store={store} port={port} />);
    await screen.findByRole('heading', { name: '设备登录与仓库绑定' });
    await bind();
    expect(screen.getByText('S2505120004')).toBeVisible();

    await userEvent.click(screen.getByRole('button', { name: '扫描' }));
    const scan = screen.getByLabelText('扫描码 / 运单号');
    await userEvent.clear(scan);
    await userEvent.type(scan, 'S2505120004{Enter}');
    await screen.findByText(/#1 .* 已本地排队/);
    expect(screen.getByTestId('pending-count')).toHaveTextContent('1');

    first.unmount();
    render(<App store={store} port={port} />);
    await screen.findByRole('heading', { name: '任务首页' });
    expect(screen.getByTestId('pending-count')).toHaveTextContent('1');
    await userEvent.click(screen.getByRole('button', { name: '离线' }));
    expect(screen.getByText(/#1/)).toHaveTextContent('S2505120004');
  });

  it('labels a repeated business intent as already queued instead of reporting a new success', async () => {
    render(<App store={new MemoryQueueStore()} port={new MemoryPdaPort()} />);
    await bind();
    await userEvent.click(screen.getByRole('button', { name: '扫描' }));
    const scan = screen.getByLabelText('扫描码 / 运单号');
    await userEvent.clear(scan);
    await userEvent.type(scan, 'S2505120004{Enter}');
    await screen.findByText(/#1 .* 已本地排队/);
    await userEvent.type(scan, '{Enter}');
    await screen.findByText(/已在本地队列，未重复写入/);
    expect(screen.getByTestId('pending-count')).toHaveTextContent('1');
  });

  it('offers a capture file fallback when camera permission is denied or BarcodeDetector is unavailable', async () => {
    const store = new MemoryQueueStore();
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: vi.fn().mockRejectedValue(new DOMException('denied', 'NotAllowedError')),
      },
    });
    render(<App store={store} port={new MemoryPdaPort()} />);
    await bind();
    await userEvent.click(screen.getByRole('button', { name: '扫描' }));
    await userEvent.click(screen.getByRole('button', { name: '打开相机扫码' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('已降级');
    const fallback = screen.getByLabelText('拍照或选择图片');
    expect(fallback).toHaveAttribute('capture', 'environment');
    fireEvent.change(fallback, {
      target: { files: [new File(['photo'], 'receipt.jpg', { type: 'image/jpeg' })] },
    });
    expect(await screen.findByText('receipt.jpg')).toBeVisible();
    const scan = screen.getByLabelText('扫描码 / 运单号');
    await userEvent.type(scan, 'S2505120004{Enter}');
    await screen.findByText(/已本地排队/);
    const persistedMedia = await new MediaQueue(store).restore();
    const persistedEvents = (await new OfflineQueue(store).restore()).events;
    expect(persistedMedia).toHaveLength(1);
    expect(persistedMedia[0]?.blob).toBeInstanceOf(Blob);
    expect(persistedEvents[0]?.envelope.mediaRefs).toEqual([persistedMedia[0]?.mediaId]);
  });

  it('shows real conflict evidence and submits all three audited decisions without hiding before resolve', async () => {
    const store = new MemoryQueueStore();
    const queue = new OfflineQueue(store);
    await queue.restore();
    const guard = new SessionGuard(queue);
    await guard.persistSession({
      deviceId: '01JDEVICE00000000000000003',
      tenantId: '01JTENANT0000000000000001',
      warehouseId: '01JWAREHOUSE00000000000001',
      subjectId: '01JSUBJECT0000000000000001',
      timezone: 'Asia/Shanghai',
      appVersion: '0.2.0',
      expiresAt: '2099-12-31T23:59:59.000Z',
      permissions: [
        'pda.use',
        'pda.sync',
        'pda.conflict.resolve',
        'lastmile.delivery.execute',
        'lastmile.pod.write',
      ],
    });
    const event = await queue.enqueue(guard.current()!, {
      action: 'PICK',
      entityRef: 'CONFLICT-1',
      payload: { bin: 'A1' },
      mediaRefs: [],
      baseVersion: 7,
    });
    await queue.applySyncResults([
      {
        eventId: event.envelope.eventId,
        disposition: 'CONFLICT',
        claimedMediaRefs: [],
        conflictId: '01JCONFLICT000000000000001',
        serverVersion: 9,
        conflictVersion: 1,
      },
    ]);
    const port = new MemoryPdaPort();
    render(<App store={store} port={port} />);
    await screen.findByRole('heading', { name: '任务首页' });
    await userEvent.click(screen.getByRole('button', { name: '离线' }));
    await userEvent.click(screen.getByRole('button', { name: '处理冲突' }));
    expect(screen.getByText('serverVersion 9')).toBeVisible();
    expect(screen.getByText(/CONFLICT-1/)).toBeVisible();
    expect(screen.getByText(/重新应用将改变库位/)).toBeVisible();
    expect(screen.getAllByRole('radio')).toHaveLength(3);

    await userEvent.click(screen.getByRole('radio', { name: '保留服务器' }));
    await userEvent.type(screen.getByLabelText('处理原因'), '经现场复核后确认处理');
    await userEvent.click(screen.getByRole('button', { name: '提交决策' }));
    await waitFor(() => expect(port.conflictResolutions).toHaveLength(1));
    expect(port.conflictResolutions[0]?.resolution).toBe('KEEP_SERVER');
  });

  it('renders every required task action in the mobile selector', async () => {
    render(<App store={new MemoryQueueStore()} port={new MemoryPdaPort()} />);
    await bind();
    await userEvent.click(screen.getByRole('button', { name: '扫描' }));
    const options = screen.getAllByRole('option').map((option) => option.textContent);
    expect(options).toEqual(
      expect.arrayContaining([
        '扫码收货',
        '复重',
        '量方',
        '上架',
        '移库',
        '分货',
        '拣货',
        '装袋',
        '装托',
        '装柜',
        '出库',
        '盘点',
        '尾程接货',
        '尾程打托',
        '尾程装车',
        '派送',
        '异常上报',
        '签收 / POD',
      ])
    );
  });

  it('persists an authoritative online delivery status and version for offline restart', async () => {
    Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: true });
    const store = new MemoryQueueStore();
    const port = new MemoryPdaPort();
    const first = render(<App store={store} port={port} />);
    await bind();
    await userEvent.click(screen.getByRole('button', { name: /LM250722001/ }));
    await userEvent.selectOptions(screen.getByLabelText('作业动作'), 'LAST_MILE_DELIVER');
    await userEvent.click(screen.getByRole('button', { name: '确认作业' }));
    await screen.findByText(/服务端已确认 派送/);

    const cached = await new OfflineQueue(store).getMeta<DeviceTask[]>('device-tasks');
    expect(cached?.find((task) => task.reference === 'LM250722001')).toMatchObject({
      status: 'OUT_FOR_DELIVERY',
      version: 4,
    });

    first.unmount();
    Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: false });
    render(<App store={store} port={port} />);
    await screen.findByRole('heading', { name: '任务首页' });
    await userEvent.click(screen.getByRole('button', { name: /LM250722001/ }));
    expect(screen.getByTestId('selected-task')).toHaveTextContent('OUT_FOR_DELIVERY · v4');
  });

  it('adopts a persisted authoritative task snapshot after a partial delivery sync error', async () => {
    Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: true });
    const store = new MemoryQueueStore();
    const queue = new OfflineQueue(store);
    await queue.restore();
    const guard = new SessionGuard(queue);
    const session: LocalDeviceSession = {
      deviceId: '01JDEVICE00000000000000003',
      tenantId: '01JTENANT0000000000000001',
      warehouseId: '01JWAREHOUSE00000000000001',
      subjectId: '01JSUBJECT0000000000000001',
      timezone: 'Asia/Shanghai',
      appVersion: '0.2.0',
      expiresAt: '2099-12-31T23:59:59.000Z',
      permissions: ['pda.use', 'pda.sync', 'lastmile.delivery.execute'],
    };
    await guard.persistSession(session);
    const initial = [
      {
        id: '01JPDATASK0000000000000011',
        type: 'LAST_MILE_DELIVERY',
        reference: 'LM-PARTIAL-A',
        status: 'LOADED',
        priority: 'HIGH',
        version: 3,
      },
      {
        id: '01JPDATASK0000000000000012',
        type: 'LAST_MILE_DELIVERY',
        reference: 'LM-PARTIAL-B',
        status: 'LOADED',
        priority: 'HIGH',
        version: 3,
      },
    ] satisfies DeviceTask[];
    const first = await queue.enqueue(session, {
      action: 'LAST_MILE_DELIVER',
      entityRef: initial[0].reference,
      payload: { taskId: initial[0].id },
      mediaRefs: [],
      baseVersion: 3,
    });
    const second = await queue.enqueue(session, {
      action: 'LAST_MILE_DELIVER',
      entityRef: initial[1].reference,
      payload: { taskId: initial[1].id },
      mediaRefs: [],
      baseVersion: 3,
    });
    const refreshed = [
      { ...initial[0], status: 'OUT_FOR_DELIVERY', version: 4 },
      initial[1],
    ] satisfies DeviceTask[];
    const port = new MemoryPdaPort();
    vi.spyOn(port, 'getDeviceTasks')
      .mockResolvedValueOnce(initial)
      .mockResolvedValueOnce(refreshed);
    vi.spyOn(port, 'syncDeviceEvents').mockResolvedValue([
      {
        eventId: first.envelope.eventId,
        disposition: 'APPLIED',
        claimedMediaRefs: [],
        serverVersion: 4,
      },
      {
        eventId: second.envelope.eventId,
        disposition: 'APPLIED',
        claimedMediaRefs: [],
        serverVersion: 4,
      },
    ]);

    render(<App store={store} port={port} />);
    await screen.findByRole('heading', { name: '任务首页' });
    await userEvent.click(screen.getByRole('button', { name: /离线/ }));
    await userEvent.click(screen.getByRole('button', { name: '立即同步' }));
    await screen.findByText(/未取得唯一且已推进的权威任务快照/);
    expect(screen.getByTestId('pending-count')).toHaveTextContent('1');
    await userEvent.click(screen.getByRole('button', { name: '任务' }));
    expect(screen.getByRole('button', { name: /LM-PARTIAL-A/ })).toHaveTextContent(
      'OUT_FOR_DELIVERY'
    );
    expect(
      (await new OfflineQueue(store).restore()).events.map((item) => item.envelope.eventId)
    ).toEqual([second.envelope.eventId]);
  });

  it('queues the complete second selected task snapshot instead of the first task of that type', async () => {
    const store = new MemoryQueueStore();
    const port = new MemoryPdaPort();
    const tasks = [
      {
        id: '01JPDATASK0000000000000001',
        type: 'LAST_MILE_DELIVERY',
        reference: 'LM-FIRST',
        status: 'LOADED',
        priority: 'HIGH',
        version: 4,
      },
      {
        id: '01JPDATASK0000000000000002',
        type: 'LAST_MILE_DELIVERY',
        reference: 'LM-SECOND',
        status: 'LOADED',
        priority: 'HIGH',
        version: 9,
      },
    ] satisfies DeviceTask[];
    vi.spyOn(port, 'getDeviceTasks').mockResolvedValue(tasks);
    render(<App store={store} port={port} />);
    await bind();

    await userEvent.click(screen.getByRole('button', { name: /LM-SECOND/ }));
    await userEvent.selectOptions(screen.getByLabelText('作业动作'), 'LAST_MILE_DELIVER');
    await userEvent.click(screen.getByRole('button', { name: '确认作业' }));
    await screen.findByText(/LM-SECOND .* 已本地排队/);

    const events = (await new OfflineQueue(store).restore()).events;
    expect(events).toHaveLength(1);
    expect(events[0]?.envelope).toMatchObject({
      entityRef: 'LM-SECOND',
      baseVersion: 9,
      payload: { taskId: '01JPDATASK0000000000000002' },
    });
  });

  it('rejects empty action fields before writing the local queue', async () => {
    const store = new MemoryQueueStore();
    render(<App store={store} port={new MemoryPdaPort()} />);
    await bind();
    await userEvent.click(screen.getByRole('button', { name: /S2505120004/ }));
    await userEvent.selectOptions(screen.getByLabelText('作业动作'), 'MEASURE_DIMENSIONS');
    await userEvent.click(screen.getByRole('button', { name: '确认作业' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('不能为空');
    expect((await new OfflineQueue(store).restore()).events).toHaveLength(0);
  });

  it('disables task-incompatible actions with an explanation', async () => {
    render(<App store={new MemoryQueueStore()} port={new MemoryPdaPort()} />);
    await bind();
    await userEvent.click(screen.getByRole('button', { name: /S2505120004/ }));

    const option = screen.getByRole('option', { name: /派送/ });
    expect(option).toBeDisabled();
    expect(option).toHaveTextContent('不适用于 RECEIVE 任务类型');
  });

  it('disables permission-bound options, camera, file, location and submit controls', async () => {
    const port = new MemoryPdaPort();
    vi.spyOn(port, 'bindDevice').mockImplementation(async (deviceId, body) => ({
      deviceId,
      tenantId: '01JTENANT0000000000000001',
      warehouseId: body.warehouseId,
      subjectId: body.subjectId,
      permissions: [],
      expiresAt: '2099-12-31T23:59:59.000Z',
    }));
    vi.spyOn(port, 'getDeviceTasks').mockResolvedValue([
      {
        id: '01JPDATASK0000000000000002',
        type: 'LAST_MILE_DELIVERY',
        reference: 'LM-POD',
        status: 'OUT_FOR_DELIVERY',
        priority: 'HIGH',
        version: 11,
      },
    ]);
    render(<App store={new MemoryQueueStore()} port={port} />);
    await bind();
    await userEvent.click(screen.getByRole('button', { name: /LM-POD/ }));

    const podOption = screen.getByRole('option', { name: /签收 \/ POD/ });
    expect(podOption).toBeDisabled();
    expect(podOption).toHaveTextContent('缺少 lastmile.pod.write 权限');
    fireEvent.change(screen.getByLabelText('作业动作'), { target: { value: 'CAPTURE_POD' } });
    expect(screen.getByRole('button', { name: '打开相机扫码' })).toBeDisabled();
    expect(screen.getByLabelText('拍照或选择图片')).toBeDisabled();
    expect(screen.getByRole('button', { name: '获取当前位置（可选）' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '确认作业' })).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveTextContent('缺少 lastmile.pod.write 权限');
  });

  it('locks the composition root when persisted event context differs from the bound session', async () => {
    const store = new MemoryQueueStore();
    const queue = new OfflineQueue(store);
    await queue.restore();
    await queue.enqueue(
      {
        deviceId: 'FOREIGN-D',
        tenantId: 'FOREIGN-T',
        warehouseId: 'FOREIGN-W',
        subjectId: 'FOREIGN-S',
        timezone: 'Asia/Shanghai',
        appVersion: '0.2.0',
      },
      { action: 'PICK', entityRef: 'FOREIGN-1', payload: {}, mediaRefs: [], baseVersion: 1 }
    );
    await new SessionGuard(queue).persistSession({
      deviceId: 'CURRENT-D',
      tenantId: 'CURRENT-T',
      warehouseId: 'CURRENT-W',
      subjectId: 'CURRENT-S',
      timezone: 'Asia/Shanghai',
      appVersion: '0.2.0',
      expiresAt: '2099-12-31T23:59:59.000Z',
      permissions: [
        'pda.use',
        'pda.sync',
        'pda.conflict.resolve',
        'lastmile.delivery.execute',
        'lastmile.pod.write',
      ],
    });
    render(<App store={store} port={new MemoryPdaPort()} />);
    expect(await screen.findByRole('heading', { name: '本地数据范围不匹配' })).toBeVisible();
    expect(screen.queryByRole('navigation', { name: 'PDA 主导航' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '扫描' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '立即同步' })).not.toBeInTheDocument();
  });
});
