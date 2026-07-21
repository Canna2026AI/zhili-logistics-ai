import { useState } from 'react';
import { AppShell, Button, DataTable, Dialog, StatusTag, type DataTableColumn } from '@zhili/ui';

type Tenant = {
  id: string;
  name: string;
  code: string;
  plan: string;
  usage: string;
  expires: string;
  state: '正常' | '即将到期';
};
const tenants: Tenant[] = [
  {
    id: '1',
    name: '智立科技（深圳）有限公司',
    code: 'zhili-szx',
    plan: '企业版',
    usage: '68%',
    expires: '2027-05-31',
    state: '正常',
  },
  {
    id: '2',
    name: '华南跨境供应链',
    code: 'south-chain',
    plan: '专业版',
    usage: '91%',
    expires: '2026-08-15',
    state: '即将到期',
  },
];

export function App() {
  const [impersonating, setImpersonating] = useState<Tenant | null>(null);
  const columns: DataTableColumn<Tenant>[] = [
    {
      key: 'name',
      header: '租户',
      width: 260,
      render: (row) => (
        <div>
          <strong>{row.name}</strong>
          <small>{row.code}</small>
        </div>
      ),
    },
    { key: 'plan', header: '套餐', render: (row) => row.plan },
    { key: 'usage', header: '本期用量', render: (row) => row.usage },
    { key: 'expires', header: '到期日', render: (row) => row.expires },
    {
      key: 'state',
      header: '状态',
      render: (row) => (
        <StatusTag tone={row.state === '正常' ? 'success' : 'warning'}>{row.state}</StatusTag>
      ),
    },
    {
      key: 'action',
      header: '操作',
      align: 'right',
      render: (row) => (
        <button className="platform-link" onClick={() => setImpersonating(row)}>
          代入
        </button>
      ),
    },
  ];
  return (
    <AppShell
      brand="智立 SaaS 平台"
      tenant="平台全局范围"
      navigation={[
        {
          label: '平台运营',
          items: [
            { id: 'tenants', label: '租户管理' },
            { id: 'plans', label: '套餐与模块' },
            { id: 'usage', label: '配额与用量' },
          ],
        },
        {
          label: '治理',
          items: [
            { id: 'announcements', label: '平台公告' },
            { id: 'audit', label: '代入与审计' },
            { id: 'operations', label: '运行中心' },
          ],
        },
      ]}
      activeNavigationId="tenants"
      tabs={[{ id: 'tenants', label: '租户管理' }]}
      activeTabId="tenants"
    >
      <div className="platform-header">
        <div>
          <h1>租户管理</h1>
          <p>管理套餐、模块、用量、到期和受审计的身份代入。</p>
        </div>
        <Button>创建租户</Button>
      </div>
      <section className="platform-stats">
        <div>
          <span>有效租户</span>
          <strong>96</strong>
        </div>
        <div>
          <span>即将到期</span>
          <strong>7</strong>
        </div>
        <div>
          <span>本月 API 调用</span>
          <strong>8.42M</strong>
        </div>
        <div>
          <span>待处理告警</span>
          <strong>3</strong>
        </div>
      </section>
      <div className="platform-toolbar">
        <input aria-label="搜索租户" placeholder="搜索租户名称或编码" />
        <Button variant="secondary">筛选</Button>
      </div>
      <DataTable ariaLabel="租户列表" columns={columns} rows={tenants} rowKey={(row) => row.id} />
      <Dialog
        open={Boolean(impersonating)}
        title="代入租户"
        description={`将以平台管理员身份进入 ${impersonating?.name ?? ''}，所有操作都会审计。`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setImpersonating(null)}>
              取消
            </Button>
            <Button>确认代入</Button>
          </>
        }
        onOpenChange={(open) => !open && setImpersonating(null)}
      >
        <label className="platform-reason">
          代入原因
          <textarea defaultValue="协助排查订单同步问题" />
        </label>
      </Dialog>
    </AppShell>
  );
}
