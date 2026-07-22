import {
  Button,
  DataTable,
  Dialog,
  Drawer,
  Input,
  StatusTag,
  type DataTableColumn,
} from '@zhili/ui';
import { useMemo, useState } from 'react';
import {
  memoryWaybillPort,
  type WaybillBatchResult,
  type WaybillPort,
} from '../../adapters/api/waybill-api';
import {
  applyWaybillFieldPolicy,
  filterWaybills,
  waybillFixtures,
  waybillStateCounts,
  type WaybillListItem,
  type WaybillDetail,
  type WaybillFieldPolicy,
  type WaybillStateFilter,
} from '../model/waybill';
import './waybill-list.css';

export type WaybillViewState =
  'normal' | 'loading' | 'empty' | 'failed' | 'forbidden' | 'expired' | 'stale' | 'partial';
export interface WaybillListProps {
  state?: WaybillViewState;
  onCreate?: () => void;
  port?: WaybillPort;
  readOnly?: boolean;
  dataScope?: string;
  fieldPolicy?: WaybillFieldPolicy;
}

const tone = (state: WaybillListItem['state']) =>
  state === '问题件'
    ? 'danger'
    : state === '待收货' || state === '待分货'
      ? 'warning'
      : state === '已签收' || state === '已发货'
        ? 'success'
        : 'info';

export function WaybillList({
  state = 'normal',
  onCreate,
  port = memoryWaybillPort,
  readOnly = false,
  dataScope = '全租户',
  fieldPolicy,
}: WaybillListProps) {
  const [filter, setFilter] = useState<WaybillStateFilter>('全部运单');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [opened, setOpened] = useState<WaybillListItem | null>(null);
  const [detail, setDetail] = useState<WaybillDetail | null>(null);
  const [detailState, setDetailState] = useState<'idle' | 'loading' | 'failed'>('idle');
  const [detailTab, setDetailTab] = useState<'overview' | 'timeline'>('overview');
  const [batchOpen, setBatchOpen] = useState(false);
  const [dangerOpen, setDangerOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [pending, setPending] = useState(false);
  const [commandError, setCommandError] = useState('');
  const [commandMessage, setCommandMessage] = useState('');
  const [batchResult, setBatchResult] = useState<WaybillBatchResult | null>(null);
  const rows = useMemo(
    () =>
      state === 'empty'
        ? []
        : filterWaybills(
            waybillFixtures.filter((item) => dataScope === '全租户' || item.branch === dataScope),
            { query, state: filter }
          ),
    [dataScope, filter, query, state]
  );

  const selectedRows = waybillFixtures.filter((item) => selected.includes(item.id));
  const effectiveFieldPolicy: WaybillFieldPolicy =
    fieldPolicy ??
    (readOnly
      ? {
          customer: 'MASK',
          customerCode: 'MASK',
          contactName: 'MASK',
          contactPhone: 'MASK',
        }
      : {});
  const visibleDetail = detail ? applyWaybillFieldPolicy(detail, effectiveFieldPolicy) : null;

  const openDetail = async (row: WaybillListItem) => {
    setOpened(row);
    setDetailTab('overview');
    setDetail(null);
    setDetailState('loading');
    try {
      const next = await port.get(row.id);
      if (dataScope !== '全租户' && next.branch !== dataScope) throw new Error('SCOPE_MISMATCH');
      setDetail(next);
      setDetailState('idle');
    } catch {
      setDetailState('failed');
    }
  };

  const runCommand = async (operation: () => Promise<void>) => {
    setPending(true);
    setCommandError('');
    setCommandMessage('');
    try {
      await operation();
    } catch {
      setCommandError('命令执行失败；结果未知，请刷新后核对权限、版本与逐项状态。');
    } finally {
      setPending(false);
    }
  };

  const failureReason = (reason: unknown) =>
    reason instanceof Error && reason.message ? reason.message : '命令被服务端拒绝';

  const runPerWaybill = async (
    operation: (row: WaybillListItem) => Promise<unknown>
  ): Promise<WaybillBatchResult> => {
    const settled = await Promise.allSettled(
      selectedRows.map(async (row) => ({ row, value: await operation(row) }))
    );
    return settled.reduce<WaybillBatchResult>(
      (result, item, index) => {
        const row = selectedRows[index]!;
        if (item.status === 'fulfilled') result.succeeded.push(row.id);
        else result.failed.push({ id: row.id, reason: failureReason(item.reason) });
        return result;
      },
      { succeeded: [], failed: [] }
    );
  };

  const finishPerWaybill = (result: WaybillBatchResult, successMessage: string) => {
    setBatchResult(result);
    setBatchOpen(false);
    if (result.failed.length === 0) setCommandMessage(successMessage);
  };

  const createLabels = () =>
    runCommand(async () => {
      const result = await runPerWaybill((row) => port.createLabel(row.id, row.version, '100X150'));
      finishPerWaybill(result, `已创建 ${result.succeeded.length} 个不可变标签任务。`);
    });

  const submitSelected = () =>
    runCommand(async () => {
      const result = await runPerWaybill((row) => port.submit(row.id, row.version));
      finishPerWaybill(result, `已提交 ${result.succeeded.length} 票预报。`);
    });

  const cancelSelected = () =>
    runCommand(async () => {
      const result = await port.batch(
        selectedRows.map((row) => ({ waybillId: row.id, expectedVersion: row.version })),
        'CANCEL',
        reason.trim()
      );
      setBatchResult(result);
      setDangerOpen(false);
      setReason('');
      if (result.failed.length === 0)
        setCommandMessage(`已取消 ${result.succeeded.length} 票运单。`);
    });

  if (state === 'loading')
    return (
      <div className="waybill-state" aria-busy="true">
        正在加载运单、权限与允许动作…
      </div>
    );
  if (state === 'failed')
    return (
      <div className="waybill-state" role="alert">
        运单加载失败 — 查询服务暂不可用 — 请重试（请求 WB-260722）
      </div>
    );
  if (state === 'forbidden')
    return (
      <div className="waybill-state" role="alert">
        缺少 waybill.read；请申请深圳分公司数据范围。
      </div>
    );
  if (state === 'expired')
    return (
      <div className="waybill-state" role="alert">
        会话已过期；查询、筛选与选择已保留，请重新登录。
      </div>
    );
  if (state === 'stale')
    return (
      <div className="waybill-state" role="alert">
        运单版本已更新：当前 v7，服务器 v8。请刷新后重试命令。
      </div>
    );

  const columns: DataTableColumn<WaybillListItem>[] = [
    {
      key: 'waybillNo',
      header: '运单号',
      width: 132,
      render: (row) => (
        <button className="waybill-link" onClick={() => void openDetail(row)}>
          {row.waybillNo}
        </button>
      ),
    },
    { key: 'masterNo', header: '主运单号', width: 140, render: (row) => row.masterNo },
    {
      key: 'state',
      header: '状态',
      width: 90,
      render: (row) => <StatusTag tone={tone(row.state)}>{row.state}</StatusTag>,
    },
    { key: 'transport', header: '运输方式', width: 100, render: (row) => row.transport },
    { key: 'destination', header: '目的地', width: 128, render: (row) => row.destination },
    { key: 'pieces', header: '件数', align: 'right', width: 64, render: (row) => row.pieces },
    {
      key: 'weightKg',
      header: '重量(kg)',
      align: 'right',
      width: 100,
      render: (row) => row.weightKg,
    },
    { key: 'createdAt', header: '创建时间', width: 148, render: (row) => row.createdAt },
    {
      key: 'actions',
      header: '操作',
      width: 110,
      render: (row) => (
        <div className="waybill-row-actions">
          <button aria-label={`查看 ${row.waybillNo}`} onClick={() => void openDetail(row)}>
            查看
          </button>
          <button
            aria-label={`复制 ${row.waybillNo}`}
            disabled
            title="待集成：运单复制端口尚未接入"
          >
            复制
          </button>
          <button
            aria-label={`${row.waybillNo} 更多操作`}
            disabled
            title="待集成：改号、拆单与合单编辑器尚未接入"
          >
            更多
          </button>
        </div>
      ),
    },
  ];

  return (
    <section className="waybill-list" aria-labelledby="waybill-list-title">
      <header className="waybill-list__title">
        <div>
          <h1 id="waybill-list-title">运单管理</h1>
          <p>本地验收数据 · 服务端分页与高级查询待接入 · 数据时点 2026-07-22 09:32</p>
        </div>
      </header>
      {state === 'partial' || batchResult?.failed.length ? (
        <div className="waybill-partial" role="status">
          <strong>
            批量执行：成功 {batchResult?.succeeded.length ?? 2}，失败{' '}
            {batchResult?.failed.length ?? 1}
          </strong>
          {batchResult?.failed.length ? (
            batchResult.failed.map((failure) => (
              <span key={failure.id}>
                {waybillFixtures.find((item) => item.id === failure.id)?.waybillNo ?? failure.id}：
                {failure.reason}
              </span>
            ))
          ) : (
            <span>S2505120007：状态不允许；问题件关闭后可重试。</span>
          )}
        </div>
      ) : null}
      {commandMessage ? <div role="status">{commandMessage}</div> : null}
      {commandError ? <div role="alert">{commandError}</div> : null}
      <div className="waybill-counters" role="tablist" aria-label="运单状态">
        {waybillStateCounts.map((item) => (
          <button
            key={item.label}
            role="tab"
            aria-selected={filter === item.label}
            onClick={() => setFilter(item.label)}
          >
            <span>{item.label}</span>
            <strong>{item.count.toLocaleString('zh-CN')}</strong>
          </button>
        ))}
      </div>
      <div className="waybill-toolbar">
        <div>
          <Button size="compact" disabled={readOnly} onClick={onCreate}>
            新增预报
          </Button>
          <Button
            size="compact"
            variant="secondary"
            disabled={readOnly || selected.length === 0 || pending}
            onClick={() => setBatchOpen(true)}
          >
            批量操作（{selected.length}）
          </Button>
          <Button size="compact" variant="secondary" disabled title="待集成：高级查询端口尚未接入">
            高级筛选
          </Button>
          <Button size="compact" variant="secondary" disabled title="待集成：保存视图端口尚未接入">
            保存视图
          </Button>
        </div>
        <label>
          筛选
          <input
            value={query}
            placeholder="运单、主单、客户、目的地"
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <div>
          <Button size="compact" variant="quiet" disabled title="待集成：列表刷新端口尚未接入">
            刷新
          </Button>
          <Button size="compact" variant="secondary" disabled title="待集成：列配置端口尚未接入">
            列管理
          </Button>
        </div>
      </div>
      <p className="waybill-integration-note">
        高级筛选、保存视图、刷新、列管理、复制和扩展命令待服务端查询与命令端口接入。
      </p>
      <DataTable
        ariaLabel="运单列表"
        columns={columns}
        rows={rows}
        rowKey={(row) => row.id}
        selectedKeys={selected}
        onSelectionChange={setSelected}
        emptyState="当前筛选无运单；清除筛选或新建预报。"
      />
      <footer className="waybill-pagination">
        <strong>共 1,248 条</strong>
        <span>20 条/页</span>
        <button aria-current="page" disabled>
          1
        </button>
        <button disabled title="待集成：服务端分页端口尚未接入">
          2
        </button>
        <button disabled title="待集成：服务端分页端口尚未接入">
          3
        </button>
        <span>…</span>
        <button disabled title="待集成：服务端分页端口尚未接入">
          63
        </button>
      </footer>
      <Drawer
        open={Boolean(opened)}
        title="运单详情"
        size={480}
        onOpenChange={(open) => {
          if (!open) {
            setOpened(null);
            setDetail(null);
            setDetailState('idle');
          }
        }}
        subheader={
          opened ? (
            <div className="waybill-drawer-summary">
              <strong>{opened.waybillNo}</strong>
              <StatusTag tone={tone(detail?.state ?? opened.state)}>
                {detail?.state ?? opened.state}
              </StatusTag>
              <span>主运单号：{opened.masterNo}</span>
            </div>
          ) : null
        }
        footer={
          <>
            <Button variant="secondary" disabled title="待集成：问题件登记端口尚未接入">
              问题件登记
            </Button>
            <Button disabled={!visibleDetail} onClick={() => setDetailTab('timeline')}>
              查看轨迹
            </Button>
          </>
        }
      >
        {opened && detailState === 'loading' ? (
          <div className="waybill-state" aria-busy="true">
            正在加载 {opened.waybillNo} 的授权详情…
          </div>
        ) : null}
        {opened && detailState === 'failed' ? (
          <div className="waybill-state" role="alert">
            详情加载失败或超出当前数据范围；未显示任何客户信息。
          </div>
        ) : null}
        {visibleDetail ? (
          <div className="waybill-drawer">
            <nav aria-label="运单详情页签">
              <button
                data-active={detailTab === 'overview' || undefined}
                onClick={() => setDetailTab('overview')}
              >
                概览
              </button>
              <button
                data-active={detailTab === 'timeline' || undefined}
                onClick={() => setDetailTab('timeline')}
              >
                轨迹
              </button>
              {['货物', '费用', '单证', '备注'].map((label) => (
                <button key={label} disabled title={`待集成：${label}详情投影尚未接入`}>
                  {label}
                </button>
              ))}
            </nav>
            {detailTab === 'overview' ? (
              <>
                <h3>基本信息</h3>
                <dl>
                  <dt>运输方式</dt>
                  <dd>{visibleDetail.transport}</dd>
                  <dt>路线</dt>
                  <dd>{visibleDetail.route}</dd>
                  <dt>服务</dt>
                  <dd>{visibleDetail.service}</dd>
                  <dt>件数</dt>
                  <dd>{visibleDetail.pieces}</dd>
                  <dt>预报重量</dt>
                  <dd>{visibleDetail.forecastWeightKg} kg</dd>
                  <dt>实际 / 计费重量</dt>
                  <dd>{visibleDetail.actualWeightKg} kg</dd>
                  <dt>体积</dt>
                  <dd>{visibleDetail.volumeM3} m³</dd>
                  <dt>创建时间</dt>
                  <dd>{visibleDetail.createdAt}</dd>
                </dl>
                <h3>客户信息</h3>
                <dl>
                  <dt>客户名称</dt>
                  <dd>{visibleDetail.customer}</dd>
                  <dt>客户编码</dt>
                  <dd>{visibleDetail.customerCode}</dd>
                  <dt>联系人</dt>
                  <dd>{visibleDetail.contactName}</dd>
                  <dt>联系电话</dt>
                  <dd>{visibleDetail.contactPhone}</dd>
                </dl>
              </>
            ) : (
              <>
                <h3>轨迹</h3>
                <ol className="waybill-timeline">
                  {visibleDetail.timeline.map((item, index) => (
                    <li
                      key={item}
                      data-current={index === visibleDetail.timeline.length - 1 || undefined}
                    >
                      {item}
                    </li>
                  ))}
                </ol>
              </>
            )}
          </div>
        ) : null}
      </Drawer>
      <Dialog
        open={batchOpen}
        title="批量操作"
        description={`已明确选择 ${selected.length} 票；不包含筛选结果中的其他运单。`}
        onOpenChange={setBatchOpen}
      >
        <div className="waybill-command-list">
          <Button variant="secondary" disabled={pending} onClick={() => void createLabels()}>
            {pending ? '执行中…' : '生成标签'}
          </Button>
          <Button variant="secondary" disabled={pending} onClick={() => void submitSelected()}>
            提交预报
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              setBatchOpen(false);
              setDangerOpen(true);
            }}
          >
            取消运单
          </Button>
        </div>
      </Dialog>
      <Dialog
        open={dangerOpen}
        title="确认取消运单"
        description="取消后不能继续收货、路由或生成承运商标签。"
        onOpenChange={setDangerOpen}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDangerOpen(false)}>
              返回
            </Button>
            <Button
              variant="danger"
              disabled={reason.trim().length < 10 || pending}
              onClick={() => void cancelSelected()}
            >
              {pending ? '取消中…' : '确认取消'}
            </Button>
          </>
        }
      >
        <div className="waybill-danger">
          <strong>将取消 {selected.length} 票运单，并保留关联记录</strong>
          <span>
            资源版本：
            {selectedRows.map((row) => `${row.waybillNo} v${row.version}`).join('；')}
            ；若服务器版本变化， 对应运单会逐项拒绝并要求刷新。
          </span>
          <span>审计：waybill.batch-command / 当前租户 / 操作人张伟</span>
        </div>
        <Input
          label="取消原因"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          hint="至少 10 个字；将写入每票运单审计。"
        />
      </Dialog>
    </section>
  );
}
