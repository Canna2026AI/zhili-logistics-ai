import { AppShell, Button, StatusTag, type NavigationGroup, type WorkspaceTab } from '@zhili/ui';
import { useState } from 'react';
import { MasterDataPanel } from '@zhili/feature-identity-masterdata';
import { QuoteWorkbench, RateCatalogPanel } from '@zhili/feature-rates-routing';
import { ImportWorkbench, OrderDraftPanel, WaybillList } from '@zhili/feature-waybills';
import { defaultOpsOrdersPorts, type OpsOrdersPorts } from './ports';
import './orders-workspace.css';

type OrdersPage =
  'dashboard' | 'master-data' | 'rate-catalog' | 'quotes' | 'orders' | 'waybills' | 'imports';

const navigation: NavigationGroup[] = [
  { label: '运营工作台', items: [{ id: 'dashboard', label: '工作台' }] },
  { label: '主数据', items: [{ id: 'master-data', label: '主数据' }] },
  {
    label: '渠道报价',
    items: [
      { id: 'rate-catalog', label: '渠道价卡' },
      { id: 'quotes', label: '报价管理' },
    ],
  },
  {
    label: '订单运单',
    items: [
      { id: 'waybills', label: '运单管理' },
      { id: 'orders', label: '订单草稿' },
      { id: 'imports', label: '导入运单' },
    ],
  },
  { label: '仓库', items: [{ id: 'warehouse', label: '仓库管理' }] },
  { label: '订舱/提单', items: [{ id: 'booking', label: '订舱管理' }] },
  { label: '尾程', items: [{ id: 'last-mile', label: '尾程管理' }] },
  { label: '轨迹客服', items: [{ id: 'tracking', label: '轨迹与问题件' }] },
  { label: '财务', items: [{ id: 'finance', label: '应收应付' }] },
  { label: '报表', items: [{ id: 'reports', label: '运营报表' }] },
  { label: '自动化集成', items: [{ id: 'automation', label: '自动化配置' }] },
  {
    label: '系统',
    items: [
      { id: 'settings', label: '系统设置' },
      { id: 'permissions', label: '权限管理' },
    ],
  },
];

const labels: Record<OrdersPage, string> = {
  dashboard: '运营工作台',
  'master-data': '主数据',
  'rate-catalog': '渠道价卡',
  quotes: '新建预报 / 报价',
  orders: '订单草稿',
  waybills: '运单管理',
  imports: '导入运单',
};

function OperationsDashboard({ onOpen }: { onOpen: (page: OrdersPage) => void }) {
  return (
    <section className="orders-dashboard">
      <header>
        <div>
          <h1>运营工作台</h1>
          <p>从异常和待办进入真实业务对象；数据时点 2026-07-22 09:32</p>
        </div>
        <Button onClick={() => onOpen('quotes')}>新建预报</Button>
      </header>
      <div className="orders-dashboard__metrics">
        <button onClick={() => onOpen('waybills')}>
          <strong>156</strong>
          <span>待收货运单</span>
        </button>
        <button onClick={() => onOpen('waybills')}>
          <strong>46</strong>
          <span>问题件</span>
        </button>
        <button onClick={() => onOpen('rate-catalog')}>
          <strong>3</strong>
          <span>价卡待发布</span>
        </button>
        <button onClick={() => onOpen('imports')}>
          <strong>2</strong>
          <span>导入待处理</span>
        </button>
      </div>
      <div className="orders-dashboard__lanes">
        <section>
          <h2>今日订单与报价</h2>
          <ol>
            <li>
              <strong>Q2505120042</strong>
              <span>DHL Express · CNY 5,320.00</span>
              <StatusTag tone="success">可提交</StatusTag>
            </li>
            <li>
              <strong>ORD-DRAFT-0268</strong>
              <span>Amazon FBA · 5 箱</span>
              <StatusTag tone="warning">待校验</StatusTag>
            </li>
          </ol>
        </section>
        <section>
          <h2>需要处理</h2>
          <ol>
            <li>
              <strong>S2505120004</strong>
              <span>已收货，待分货 · +1.50 kg</span>
              <StatusTag tone="warning">待分货</StatusTag>
            </li>
            <li>
              <strong>S2505120007</strong>
              <span>缺少客户补充资料</span>
              <StatusTag tone="danger">问题件</StatusTag>
            </li>
          </ol>
        </section>
      </div>
    </section>
  );
}

export interface OpsOrdersWorkspaceProps {
  initialPage?: OrdersPage;
  showPermissionController?: boolean;
  ports?: Partial<OpsOrdersPorts>;
}

export function OpsOrdersWorkspace({
  initialPage = 'waybills',
  showPermissionController = false,
  ports,
}: OpsOrdersWorkspaceProps) {
  const [page, setPage] = useState<OrdersPage>(initialPage);
  const [openPages, setOpenPages] = useState<OrdersPage[]>(
    initialPage === 'dashboard' ? ['dashboard'] : ['dashboard', initialPage]
  );
  const [simulation, setSimulation] = useState(false);
  const activePorts = { ...defaultOpsOrdersPorts, ...ports };

  const open = (next: OrdersPage) => {
    setPage(next);
    setOpenPages((pages) => (pages.includes(next) ? pages : [...pages, next]));
  };

  const tabs: WorkspaceTab[] = openPages.map((id) => ({
    id,
    label: labels[id],
    stale: false,
  }));

  const content =
    page === 'dashboard' ? (
      <OperationsDashboard onOpen={open} />
    ) : page === 'master-data' ? (
      <MasterDataPanel
        port={activePorts.masterData}
        readOnly={simulation}
        dataScope={simulation ? '深圳分公司' : '全租户'}
        maskPhone={simulation}
      />
    ) : page === 'rate-catalog' ? (
      <RateCatalogPanel port={activePorts.rates} readOnly={simulation} />
    ) : page === 'quotes' ? (
      <QuoteWorkbench
        port={activePorts.quotes}
        state={simulation ? 'forbidden-cost' : 'normal'}
        readOnly={simulation}
      />
    ) : page === 'orders' ? (
      <OrderDraftPanel port={activePorts.orders} readOnly={simulation} />
    ) : page === 'imports' ? (
      <ImportWorkbench port={activePorts.imports} readOnly={simulation} />
    ) : (
      <WaybillList
        port={activePorts.waybills}
        readOnly={simulation}
        dataScope={simulation ? '深圳分公司' : '全租户'}
        onCreate={() => open('quotes')}
      />
    );

  return (
    <AppShell
      brand="智立科技物流AI系统"
      tenant="智立科技物流（深圳）有限公司"
      navigation={navigation}
      activeNavigationId={page}
      tabs={tabs}
      activeTabId={page}
      onNavigate={(id) => {
        if (id in labels) open(id as OrdersPage);
      }}
      onTabChange={(id) => open(id as OrdersPage)}
    >
      {showPermissionController ? (
        <div
          className={
            simulation ? 'orders-permission orders-permission--active' : 'orders-permission'
          }
        >
          {simulation ? (
            <>
              <div>
                <strong>权限模拟：王丽 · 客服专员</strong>
                <span>
                  waybill.read 被 ALLOW、waybill.write 被
                  DENY，其他写动作同步禁用；数据范围仅深圳分公司；手机号按字段策略脱敏。模拟剩余 13
                  分钟，操作会记录审计。
                </span>
              </div>
              <Button size="compact" variant="secondary" onClick={() => setSimulation(false)}>
                结束模拟
              </Button>
            </>
          ) : (
            <>
              <span>当前视角：运营管理员 · 全租户业务范围</span>
              <Button size="compact" variant="secondary" onClick={() => setSimulation(true)}>
                模拟只读权限
              </Button>
            </>
          )}
        </div>
      ) : null}
      {content}
    </AppShell>
  );
}

export default OpsOrdersWorkspace;
