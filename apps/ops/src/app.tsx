import { useMemo, useState } from 'react';
import { AppShell, Button, DataTable, Drawer, StatusTag, type DataTableColumn } from '@zhili/ui';

type Waybill = {
  id: string;
  no: string;
  customer: string;
  route: string;
  expected: string;
  actual: string;
  state: string;
};

const rows: Waybill[] = [
  {
    id: '1',
    no: 'S2505120004',
    customer: '深圳鑫源贸易有限公司',
    route: 'CN-SZX → US-LAX',
    expected: '122.00 kg',
    actual: '123.50 kg',
    state: '已收货',
  },
  {
    id: '2',
    no: 'S2505120005',
    customer: '广州远航供应链',
    route: 'CN-CAN → US-ONT',
    expected: '86.00 kg',
    actual: '86.20 kg',
    state: '待分货',
  },
  {
    id: '3',
    no: 'S2505120006',
    customer: '东莞新锐电子有限公司',
    route: 'CN-SZX → DE-FRA',
    expected: '42.00 kg',
    actual: '—',
    state: '待收货',
  },
];

export function App() {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [opened, setOpened] = useState<Waybill | null>(null);
  const visibleRows = useMemo(
    () =>
      rows.filter((row) => `${row.no}${row.customer}`.toLowerCase().includes(query.toLowerCase())),
    [query]
  );
  const columns: DataTableColumn<Waybill>[] = [
    {
      key: 'no',
      header: '运单号',
      render: (row) => (
        <button className="ops-link" onClick={() => setOpened(row)}>
          {row.no}
        </button>
      ),
    },
    { key: 'customer', header: '客户', width: 240, render: (row) => row.customer },
    { key: 'route', header: '路由', render: (row) => row.route },
    { key: 'expected', header: '预报重', align: 'right', render: (row) => row.expected },
    { key: 'actual', header: '实收重', align: 'right', render: (row) => row.actual },
    {
      key: 'state',
      header: '状态',
      render: (row) => (
        <StatusTag tone={row.state === '已收货' ? 'success' : 'warning'}>{row.state}</StatusTag>
      ),
    },
  ];

  return (
    <AppShell
      brand="智立科技物流AI系统"
      tenant="智立科技（深圳）有限公司"
      navigation={[
        { label: '运营', items: [{ id: 'dashboard', label: '运营工作台' }] },
        {
          label: '基础资料',
          items: [
            { id: 'customers', label: '客户管理' },
            { id: 'rates', label: '渠道报价' },
          ],
        },
        {
          label: '订单履约',
          items: [
            { id: 'waybills', label: '订单运单' },
            { id: 'warehouse', label: '仓库作业' },
            { id: 'linehaul', label: '订舱与提单' },
            { id: 'last-mile', label: '尾程配送' },
          ],
        },
        {
          label: '服务结算',
          items: [
            { id: 'support', label: '轨迹客服' },
            { id: 'finance', label: '财务结算' },
          ],
        },
        {
          label: '系统',
          items: [
            { id: 'automation', label: '自动化集成' },
            { id: 'settings', label: '系统设置' },
          ],
        },
      ]}
      activeNavigationId="waybills"
      tabs={[
        { id: 'home', label: '运营工作台' },
        { id: 'waybills', label: '运单' },
      ]}
      activeTabId="waybills"
      onSearch={setQuery}
    >
      <div className="ops-page-header">
        <div>
          <h1>运单管理</h1>
          <p>管理预报、收货、分货、运输与交付状态</p>
        </div>
        <Button>新建预报</Button>
      </div>
      <div className="ops-counters" aria-label="运单状态统计">
        <button>
          <strong>128</strong>
          <span>待收货</span>
        </button>
        <button>
          <strong>36</strong>
          <span>待分货</span>
        </button>
        <button>
          <strong>204</strong>
          <span>运输中</span>
        </button>
        <button>
          <strong>9</strong>
          <span>问题件</span>
        </button>
      </div>
      <div className="ops-toolbar">
        <span>共 {visibleRows.length} 条</span>
        <Button variant="secondary" disabled={selected.length === 0}>
          批量操作（{selected.length}）
        </Button>
      </div>
      <DataTable
        ariaLabel="运单列表"
        columns={columns}
        rows={visibleRows}
        rowKey={(row) => row.id}
        selectedKeys={selected}
        onSelectionChange={setSelected}
      />
      <Drawer
        open={Boolean(opened)}
        title="运单详情"
        subheader={opened ? <StatusTag tone="success">{opened.state}</StatusTag> : null}
        footer={<Button onClick={() => setOpened(null)}>完成</Button>}
        onOpenChange={(open) => !open && setOpened(null)}
      >
        {opened ? (
          <dl className="ops-detail">
            <dt>运单号</dt>
            <dd>{opened.no}</dd>
            <dt>客户</dt>
            <dd>{opened.customer}</dd>
            <dt>路由</dt>
            <dd>{opened.route}</dd>
            <dt>预报重</dt>
            <dd>{opened.expected}</dd>
            <dt>实收/计费重</dt>
            <dd>{opened.actual}</dd>
            <dt>体积</dt>
            <dd>0.48 m³</dd>
          </dl>
        ) : null}
      </Drawer>
    </AppShell>
  );
}
