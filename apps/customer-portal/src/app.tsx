import { useState } from 'react';
import { Button, DataTable, StatusTag, type DataTableColumn } from '@zhili/ui';

type Statement = {
  id: string;
  no: string;
  period: string;
  total: string;
  allocated: string;
  outstanding: string;
  state: string;
};
const statements: Statement[] = [
  {
    id: '1',
    no: 'ST202605-0008',
    period: '2026年5月',
    total: 'CNY 5,320.00',
    allocated: 'CNY 3,000.00',
    outstanding: 'CNY 2,320.00',
    state: '待付款',
  },
];

export function App() {
  const [active, setActive] = useState('首页');
  const columns: DataTableColumn<Statement>[] = [
    { key: 'no', header: '账单号', render: (row) => <a href={`#${row.no}`}>{row.no}</a> },
    { key: 'period', header: '账期', render: (row) => row.period },
    { key: 'total', header: '账单金额', align: 'right', render: (row) => row.total },
    { key: 'allocated', header: '已核销', align: 'right', render: (row) => row.allocated },
    { key: 'outstanding', header: '未收金额', align: 'right', render: (row) => row.outstanding },
    {
      key: 'state',
      header: '状态',
      render: (row) => <StatusTag tone="warning">{row.state}</StatusTag>,
    },
  ];
  return (
    <div className="portal-shell">
      <header>
        <div className="portal-brand">
          <span>智</span>智立客户门户
        </div>
        <nav aria-label="客户门户导航">
          {['首页', '在线下单', '运单查询', '账单与付款', '服务工单'].map((item) => (
            <button
              key={item}
              data-active={active === item || undefined}
              onClick={() => setActive(item)}
            >
              {item}
            </button>
          ))}
        </nav>
        <div className="portal-user">深圳鑫源贸易有限公司</div>
      </header>
      <main>
        <div className="portal-heading">
          <div>
            <h1>您好，深圳鑫源贸易有限公司</h1>
            <p>订单、轨迹、账单和问题处理都在这里。</p>
          </div>
          <Button>新建预报</Button>
        </div>
        <section className="portal-tasks" aria-label="待办任务">
          <button>
            <strong>3</strong>
            <span>待补资料</span>
          </button>
          <button>
            <strong>1</strong>
            <span>异常待处理</span>
          </button>
          <button>
            <strong>2,320.00</strong>
            <span>CNY 待付款</span>
          </button>
          <button>
            <strong>5</strong>
            <span>运输中</span>
          </button>
        </section>
        <section className="portal-section">
          <div className="portal-section-title">
            <div>
              <h2>最近账单</h2>
              <p>仅显示本企业账单与预存款分配结果</p>
            </div>
            <Button variant="secondary">查看全部</Button>
          </div>
          <DataTable
            ariaLabel="最近账单"
            columns={columns}
            rows={statements}
            rowKey={(row) => row.id}
          />
        </section>
        <section className="portal-waybill">
          <div>
            <span className="portal-label">最近运单</span>
            <h2>S2505120004</h2>
            <p>CN-SZX → US-LAX · 实收/计费重 123.50 kg · 0.48 m³</p>
          </div>
          <StatusTag tone="success">已收货</StatusTag>
        </section>
      </main>
      <nav className="portal-mobile-nav" aria-label="移动端导航">
        {['首页', '下单', '运单', '账单', '我的'].map((item) => (
          <button key={item}>{item}</button>
        ))}
      </nav>
    </div>
  );
}
