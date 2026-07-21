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
  filterWaybills,
  waybillFixtures,
  waybillStateCounts,
  type WaybillListItem,
  type WaybillStateFilter,
} from '../model/waybill';
import './waybill-list.css';

export type WaybillViewState =
  'normal' | 'loading' | 'empty' | 'failed' | 'forbidden' | 'expired' | 'stale' | 'partial';
export interface WaybillListProps {
  state?: WaybillViewState;
  onCreate?: () => void;
}

const tone = (state: WaybillListItem['state']) =>
  state === '问题件'
    ? 'danger'
    : state === '待收货' || state === '待分货'
      ? 'warning'
      : state === '已签收' || state === '已发货'
        ? 'success'
        : 'info';

export function WaybillList({ state = 'normal', onCreate }: WaybillListProps) {
  const [filter, setFilter] = useState<WaybillStateFilter>('全部运单');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [opened, setOpened] = useState<WaybillListItem | null>(null);
  const [batchOpen, setBatchOpen] = useState(false);
  const [dangerOpen, setDangerOpen] = useState(false);
  const [reason, setReason] = useState('');
  const rows = useMemo(
    () => (state === 'empty' ? [] : filterWaybills(waybillFixtures, { query, state: filter })),
    [filter, query, state]
  );

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
        <button className="waybill-link" onClick={() => setOpened(row)}>
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
          <button aria-label={`查看 ${row.waybillNo}`} onClick={() => setOpened(row)}>
            查看
          </button>
          <button aria-label={`复制 ${row.waybillNo}`}>复制</button>
          <button aria-label={`${row.waybillNo} 更多操作`}>更多</button>
        </div>
      ),
    },
  ];

  return (
    <section className="waybill-list" aria-labelledby="waybill-list-title">
      <header className="waybill-list__title">
        <div>
          <h1 id="waybill-list-title">运单管理</h1>
          <p>服务端分页与筛选 · 当前数据时点 2026-07-22 09:32</p>
        </div>
      </header>
      {state === 'partial' ? (
        <div className="waybill-partial" role="status">
          <strong>批量执行：成功 2，失败 1</strong>
          <span>S2505120007：状态不允许；问题件关闭后可重试。</span>
        </div>
      ) : null}
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
          <Button size="compact" onClick={onCreate}>
            新增预报
          </Button>
          <Button
            size="compact"
            variant="secondary"
            disabled={selected.length === 0}
            onClick={() => setBatchOpen(true)}
          >
            批量操作（{selected.length}）
          </Button>
          <Button size="compact" variant="secondary">
            高级筛选
          </Button>
          <Button size="compact" variant="secondary">
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
          <Button size="compact" variant="quiet">
            刷新
          </Button>
          <Button size="compact" variant="secondary">
            列管理
          </Button>
        </div>
      </div>
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
        <button aria-current="page">1</button>
        <button>2</button>
        <button>3</button>
        <span>…</span>
        <button>63</button>
      </footer>
      <Drawer
        open={Boolean(opened)}
        title="运单详情"
        size={480}
        onOpenChange={(open) => !open && setOpened(null)}
        subheader={
          opened ? (
            <div className="waybill-drawer-summary">
              <strong>{opened.waybillNo}</strong>
              <StatusTag tone="success">已收货，待分货</StatusTag>
              <span>主运单号：{opened.masterNo}</span>
            </div>
          ) : null
        }
        footer={
          <>
            <Button variant="secondary">问题件登记</Button>
            <Button>查看轨迹</Button>
          </>
        }
      >
        {opened ? (
          <div className="waybill-drawer">
            <nav aria-label="运单详情页签">
              <button data-active>概览</button>
              <button>轨迹</button>
              <button>货物</button>
              <button>费用</button>
              <button>单证</button>
              <button>备注</button>
            </nav>
            <h3>基本信息</h3>
            <dl>
              <dt>运输方式</dt>
              <dd>{opened.transport}</dd>
              <dt>路线</dt>
              <dd>CN-SZX → US-LAX</dd>
              <dt>服务</dt>
              <dd>DHL Express Worldwide</dd>
              <dt>件数</dt>
              <dd>{opened.pieces}</dd>
              <dt>预报重量</dt>
              <dd>122.00 kg</dd>
              <dt>实际 / 计费重量</dt>
              <dd>123.50 kg</dd>
              <dt>体积</dt>
              <dd>0.48 m³</dd>
              <dt>创建时间</dt>
              <dd>{opened.createdAt}</dd>
            </dl>
            <h3>客户信息</h3>
            <dl>
              <dt>客户名称</dt>
              <dd>{opened.customer}</dd>
              <dt>客户编码</dt>
              <dd>CUST00256</dd>
              <dt>联系人</dt>
              <dd>王志强</dd>
              <dt>联系电话</dt>
              <dd>139 2654 8800</dd>
            </dl>
            <h3>当前节点</h3>
            <ol className="waybill-timeline">
              <li data-complete>已收货 · 深圳仓库</li>
              <li data-current>待分货 · 深圳仓库</li>
              <li>待转运</li>
              <li>运输中</li>
              <li>已到港</li>
              <li>已签收</li>
            </ol>
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
          <Button variant="secondary">生成标签</Button>
          <Button variant="secondary">提交预报</Button>
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
            <Button variant="danger" disabled={reason.trim().length < 10}>
              确认取消
            </Button>
          </>
        }
      >
        <div className="waybill-danger">
          <strong>将取消 {selected.length} 票运单，并保留关联记录</strong>
          <span>版本 v7；若服务器版本变化，本命令会拒绝并要求刷新。</span>
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
