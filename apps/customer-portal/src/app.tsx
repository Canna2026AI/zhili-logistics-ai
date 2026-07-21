import { useState, type ReactNode } from 'react';
import { Button, Dialog, StatusTag } from '@zhili/ui';

type Page =
  | '工作台'
  | '新建运单'
  | '批量导入'
  | '查价'
  | '我的运单'
  | '轨迹查询'
  | '账单与付款'
  | '问题工单'
  | '地址簿'
  | 'API';
type Scenario = 'normal' | 'loading' | 'empty' | 'failed' | 'forbidden' | 'stale' | 'partial';

const navigation: Page[] = [
  '工作台',
  '新建运单',
  '批量导入',
  '查价',
  '我的运单',
  '轨迹查询',
  '账单与付款',
  '问题工单',
  '地址簿',
  'API',
];

const waybills = [
  ['S2505120001', 'HBL2505120001', '运输中', '英国/洛杉矶', '20', '12,340.50', '在港装船'],
  ['S2505120002', 'HBL2505120002', '待收货', '德国/法兰克福', '5', '320.00', '到达仓库'],
  ['S2505120003', 'HBL2505120003', '运输中', '美国/伦敦', '8', '1,250.30', '离港'],
  ['S2505120004', 'HBL2505120004', '已收货，待分货', '澳大利亚/悉尼', '18', '123.50', '已收货'],
  ['S2505120005', 'HBL2505120005', '运输中', '俄罗斯/莫斯科', '12', '6,500.00', '中转中'],
] as const;

function ScenarioNotice({ scenario }: { scenario: Scenario }) {
  if (scenario === 'normal') return null;
  const notices: Record<Exclude<Scenario, 'normal'>, { role: 'alert' | 'status'; text: string }> = {
    loading: { role: 'status', text: '正在加载最新数据，请稍候。' },
    empty: { role: 'status', text: '当前筛选没有数据，可清除筛选或创建第一条记录。' },
    failed: { role: 'alert', text: '请求失败：网关暂时不可用。请重试；请求号 REQ-C-260512。' },
    forbidden: {
      role: 'alert',
      text: '缺少 ticket.read 权限；可联系企业管理员申请，数据未被当作空结果。',
    },
    stale: { role: 'alert', text: '页面数据已过期：本地 v12，服务器 v13。刷新后可继续操作。' },
    partial: { role: 'status', text: '部分成功：4 项完成、1 项通知失败。仅重试失败项。' },
  };
  const notice = notices[scenario];
  return (
    <div className={`portal-notice portal-notice--${scenario}`} role={notice.role}>
      {notice.text}
    </div>
  );
}

function SectionHeader({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="portal-page-title">
      <div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {action}
    </div>
  );
}

function Dashboard({ navigate }: { navigate: (page: Page) => void }) {
  return (
    <>
      <SectionHeader
        title="下午好，张伟 👋"
        description="欢迎使用智立科技物流AI系统"
        action={<Button onClick={() => navigate('新建运单')}>新建运单</Button>}
      />
      <section className="portal-dashboard-grid">
        <div className="portal-dashboard-main">
          <section className="portal-actions" aria-label="快捷操作">
            <button aria-label="快速新建运单" onClick={() => navigate('新建运单')}>
              <b>＋</b>
              <span>
                <strong>新建运单</strong>
                <small>创建新的运输订单</small>
              </span>
            </button>
            <button aria-label="批量导入运单" onClick={() => navigate('批量导入')}>
              <b>⇧</b>
              <span>
                <strong>批量导入</strong>
                <small>Excel 批量导入运单</small>
              </span>
            </button>
            <button aria-label="立即查价" onClick={() => navigate('查价')}>
              <b>⌕</b>
              <span>
                <strong>立即查价</strong>
                <small>快速获取运费报价</small>
              </span>
            </button>
          </section>
          <section className="portal-counters" aria-label="运单状态">
            {[
              ['待预报', '128', '+12'],
              ['待收货', '86', '-5'],
              ['运输中', '238', '+18'],
              ['问题件', '17', '+3'],
              ['已签收', '1,123', '+42'],
            ].map(([label, value, delta]) => (
              <button
                key={label}
                onClick={() => navigate(label === '问题件' ? '问题工单' : '我的运单')}
              >
                <span>{label}</span>
                <strong>{value}</strong>
                <small>较昨日 {delta}</small>
              </button>
            ))}
          </section>
          <div className="portal-panel portal-wide">
            <div className="portal-panel-head">
              <h2>最近运单</h2>
              <button onClick={() => navigate('我的运单')}>查看全部</button>
            </div>
            <WaybillTable onTrack={() => navigate('轨迹查询')} compact />
          </div>
          <section className="portal-secondary-actions" aria-label="可编辑快捷入口">
            <div>
              <h2>快捷入口（可编辑）</h2>
              <button>编辑</button>
            </div>
            <nav>
              <button onClick={() => navigate('新建运单')}>
                <strong>新建运单</strong>
                <small>创建运输订单</small>
              </button>
              <button onClick={() => navigate('批量导入')}>
                <strong>批量导入</strong>
                <small>Excel 批量导入</small>
              </button>
              <button onClick={() => navigate('查价')}>
                <strong>立即查价</strong>
                <small>快速获取报价</small>
              </button>
              <button aria-label="提交付款凭证" onClick={() => navigate('账单与付款')}>
                <strong>提交付款凭证</strong>
                <small>上传凭证并关联</small>
              </button>
            </nav>
          </section>
        </div>
        <aside className="portal-finance-stack">
          <div className="portal-panel">
            <h2>预存款与未分配收款</h2>
            <strong className="portal-money">CNY 128,560.00</strong>
            <small>仅用于物流账单结算</small>
            <button onClick={() => navigate('账单与付款')}>资金明细</button>
          </div>
          <div className="portal-panel">
            <h2>待付款单</h2>
            <strong className="portal-money portal-money--danger">CNY 2,320.00</strong>
            <small>1 张付款申请等待支付</small>
            <Button onClick={() => navigate('账单与付款')}>去支付</Button>
          </div>
          <div className="portal-panel">
            <h2>对账单</h2>
            <strong>ST202605-0008</strong>
            <dl>
              <div>
                <dt>账单总额</dt>
                <dd>CNY 5,320.00</dd>
              </div>
              <div>
                <dt>待支付/余额</dt>
                <dd>CNY 2,320.00</dd>
              </div>
            </dl>
          </div>
          <div className="portal-panel portal-mini-list">
            <h2>最近工单</h2>
            <p>
              <span>#T250512001 运单延误咨询</span>
              <StatusTag tone="info">处理中</StatusTag>
            </p>
            <p>
              <span>#T250511008 发票未收到</span>
              <StatusTag tone="info">处理中</StatusTag>
            </p>
            <button onClick={() => navigate('问题工单')}>查看全部工单</button>
          </div>
          <div className="portal-panel portal-mini-list">
            <h2>通知中心</h2>
            <p>
              <span>运单 S2505120004 已收货</span>
              <small>08:16</small>
            </p>
            <p>
              <span>账单 ST202605-0008 已生成</span>
              <small>昨天</small>
            </p>
          </div>
        </aside>
      </section>
      <button className="portal-service" aria-label="在线客服" onClick={() => navigate('问题工单')}>
        在线客服
      </button>
    </>
  );
}

function QuotePage({ choose }: { choose: () => void }) {
  const [quoted, setQuoted] = useState(false);
  return (
    <>
      <SectionHeader
        title="多渠道查价"
        description="报价保留计费重、分区、规则版本、费用拆分与有效期。"
      />
      <form
        className="portal-form portal-form--quote"
        onSubmit={(event) => {
          event.preventDefault();
          setQuoted(true);
        }}
      >
        <label>
          始发地
          <input defaultValue="CN-SZX" />
        </label>
        <label>
          目的地邮编
          <input aria-label="目的地邮编" />
        </label>
        <label>
          实重（kg）
          <input defaultValue="123.50" inputMode="decimal" />
        </label>
        <label>
          体积（m³）
          <input defaultValue="0.48" inputMode="decimal" />
        </label>
        <Button type="submit">获取报价</Button>
      </form>
      {quoted ? (
        <section className="portal-panel portal-quote-result" aria-live="polite">
          <div>
            <StatusTag tone="success">可用</StatusTag>
            <h2>智立海运专线</h2>
            <p>计费重 123.50 kg · US-LAX 4 区 · 价卡 v2026.05</p>
          </div>
          <dl>
            <div>
              <dt>基础运费</dt>
              <dd>CNY 4,860.00</dd>
            </div>
            <div>
              <dt>附加费</dt>
              <dd>CNY 460.00</dd>
            </div>
            <div>
              <dt>合计</dt>
              <dd>CNY 5,320.00</dd>
            </div>
          </dl>
          <div>
            <small>报价有效至 2026-05-12 18:00</small>
            <Button onClick={choose}>选择此报价</Button>
          </div>
        </section>
      ) : null}
    </>
  );
}

function OrderPage({
  selectedQuote,
  onSubmitted,
}: {
  selectedQuote: boolean;
  onSubmitted: () => void;
}) {
  return (
    <>
      <SectionHeader
        title="新建运单"
        description="填写收发件、货物与渠道信息，校验通过后提交预报。"
      />
      <form
        className="portal-form portal-order-form"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmitted();
        }}
      >
        {selectedQuote ? (
          <p className="portal-selected-quote">已选择：智立海运专线 · CNY 5,320.00</p>
        ) : null}
        <fieldset>
          <legend>收件信息</legend>
          <label>
            收件人
            <input aria-label="收件人" required />
          </label>
          <label>
            目的地
            <input aria-label="目的地" required />
          </label>
          <label>
            联系电话
            <input defaultValue="+1 213 555 0108" />
          </label>
        </fieldset>
        <fieldset>
          <legend>货物信息</legend>
          <label>
            品名
            <input defaultValue="服装样品" />
          </label>
          <label>
            件数
            <input defaultValue="18" inputMode="numeric" />
          </label>
          <label>
            预报重（kg）
            <input defaultValue="122.00" inputMode="decimal" />
          </label>
        </fieldset>
        <div className="portal-form-actions">
          <Button variant="secondary" type="button">
            保存草稿
          </Button>
          <Button type="submit">提交预报</Button>
        </div>
      </form>
    </>
  );
}

function WaybillTable({ onTrack, compact = false }: { onTrack: () => void; compact?: boolean }) {
  return (
    <div className="portal-table-wrap">
      <table aria-label={compact ? '最近运单' : '我的运单列表'} className="portal-table">
        <thead>
          <tr>
            <th>运单号</th>
            <th>主运单号</th>
            <th>状态</th>
            <th>目的地</th>
            <th>件数</th>
            <th>重量(kg)</th>
            <th>最新轨迹</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          {waybills.map((row) => (
            <tr key={row[0]}>
              <td>
                <strong>{row[0]}</strong>
              </td>
              <td>{row[1]}</td>
              <td>
                <StatusTag
                  tone={
                    row[2].includes('已') ? 'success' : row[2].includes('待') ? 'warning' : 'info'
                  }
                >
                  {row[2]}
                </StatusTag>
              </td>
              <td>{row[3]}</td>
              <td>{row[4]}</td>
              <td>{row[5]}</td>
              <td>{row[6]}</td>
              <td>
                <button aria-label={`查看轨迹 ${row[0]}`} onClick={onTrack}>
                  查看
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function WaybillsPage({ onTrack }: { onTrack: () => void }) {
  return (
    <>
      <SectionHeader
        title="我的运单"
        description="仅显示深圳鑫源贸易有限公司的数据范围，共 1,248 条。"
        action={<Button>导出当前结果</Button>}
      />
      <div className="portal-filter">
        <input aria-label="搜索运单" placeholder="运单号 / 主运单号 / 参考号" />
        <select aria-label="运单状态">
          <option>全部状态</option>
          <option>运输中</option>
          <option>已收货</option>
        </select>
        <Button variant="secondary">查询</Button>
      </div>
      <WaybillTable onTrack={onTrack} />
    </>
  );
}

function TrackingPage() {
  return (
    <>
      <SectionHeader
        title="运单轨迹"
        description="事件时间与接收时间分别保留，客户不可见内部责任、成本和私密备注。"
      />
      <section className="portal-panel portal-tracking">
        <div className="portal-waybill-summary">
          <div>
            <small>运单号</small>
            <strong>S2505120004</strong>
          </div>
          <StatusTag tone="success">已收货，待分货</StatusTag>
        </div>
        <ol>
          <li>
            <time>2026-05-12 08:16</time>
            <strong>已收货 · 悉尼仓库</strong>
            <span>来源：仓库扫描</span>
          </li>
          <li>
            <time>2026-05-11 19:20</time>
            <strong>到达目的港</strong>
            <span>来源：承运商同步</span>
          </li>
          <li>
            <time>2026-05-08 09:40</time>
            <strong>干线运输中</strong>
            <span>来源：智立干线</span>
          </li>
        </ol>
      </section>
    </>
  );
}

function FinancePage({ requestPayment }: { requestPayment: () => void }) {
  return (
    <>
      <SectionHeader
        title="账单与付款"
        description="预存款、未分配收款、账单快照与支付记录同屏可追溯。"
      />
      <section className="portal-balance">
        <div>
          <span>预存款 CNY 128,560.00</span>
          <small>可用余额</small>
        </div>
        <div>
          <span>未分配收款 CNY 1,200.00</span>
          <small>待确认归属</small>
        </div>
        <div>
          <span>本期待付款 CNY 2,320.00</span>
          <small>ST202605-0008</small>
        </div>
      </section>
      <section className="portal-panel">
        <h2>最近账单</h2>
        <div className="portal-table-wrap">
          <table aria-label="最近账单" className="portal-table">
            <thead>
              <tr>
                <th>账单号</th>
                <th>期间</th>
                <th>总额</th>
                <th>已分配</th>
                <th>余额</th>
                <th>状态</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>ST202605-0008</td>
                <td>2026-05</td>
                <td>CNY 5,320.00</td>
                <td>CNY 3,000.00</td>
                <td>CNY 2,320.00</td>
                <td>
                  <StatusTag tone="warning">待付款</StatusTag>
                </td>
                <td>
                  <button aria-label="支付 ST202605-0008" onClick={requestPayment}>
                    支付
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
      <section className="portal-panel">
        <h2>付款记录</h2>
        <div className="portal-table-wrap">
          <table aria-label="付款记录" className="portal-table">
            <thead>
              <tr>
                <th>支付单号</th>
                <th>账单号</th>
                <th>金额</th>
                <th>渠道</th>
                <th>状态</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>PAY-20260512-01</td>
                <td>ST202605-0008</td>
                <td>CNY 2,320.00</td>
                <td>微信支付</td>
                <td>
                  <StatusTag tone="info">待支付</StatusTag>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

function TicketsPage({ notify }: { notify: (message: string) => void }) {
  return (
    <>
      <SectionHeader
        title="问题工单"
        description="补充资料、评论和查看结果；内部责任与私密备注始终隔离。"
      />
      <section className="portal-ticket-layout">
        <form
          className="portal-form"
          onSubmit={(event) => {
            event.preventDefault();
            notify('工单已创建，通知发送失败；工单不回滚，可仅重试通知。');
          }}
        >
          <label>
            关联运单
            <input defaultValue="S2505120004" />
          </label>
          <label>
            问题类型
            <select defaultValue="tracking">
              <option value="tracking">轨迹停滞</option>
              <option value="damage">货损</option>
            </select>
          </label>
          <label>
            问题描述
            <textarea aria-label="问题描述" required />
          </label>
          <Button type="submit">提交工单</Button>
        </form>
        <div className="portal-panel">
          <h2>最近工单</h2>
          <p>
            #T250512001 · 运单延误咨询 <StatusTag tone="info">处理中</StatusTag>
          </p>
          <p>
            #T250511008 · 发票未收到 <StatusTag tone="info">处理中</StatusTag>
          </p>
        </div>
      </section>
    </>
  );
}

function ApiPage({ notify }: { notify: (message: string) => void }) {
  return (
    <>
      <SectionHeader
        title="API 申请"
        description="按最小权限申请接口范围，密钥仅在审批通过后生成。"
      />
      <form
        className="portal-form portal-api-form"
        onSubmit={(event) => {
          event.preventDefault();
          notify('API 申请已提交，预计 1 个工作日内审核。');
        }}
      >
        <label>
          <input aria-label="运单查询" type="checkbox" /> 运单查询
        </label>
        <label>
          <input type="checkbox" /> 轨迹订阅
        </label>
        <label>
          <input type="checkbox" /> 创建预报
        </label>
        <label>
          用途说明
          <textarea defaultValue="企业 ERP 对接" />
        </label>
        <Button type="submit">提交 API 申请</Button>
      </form>
    </>
  );
}

function PlaceholderPage({ page }: { page: Page }) {
  return (
    <>
      <SectionHeader title={page} description="该功能遵循当前企业数据边界。" />
      <section className="portal-panel portal-empty">
        <strong>{page}</strong>
        <p>功能入口已就绪，可继续完成对应业务操作。</p>
      </section>
    </>
  );
}

export function App() {
  const [page, setPage] = useState<Page>('工作台');
  const [scenario, setScenario] = useState<Scenario>('normal');
  const [selectedQuote, setSelectedQuote] = useState(false);
  const [toast, setToast] = useState('');
  const [paymentOpen, setPaymentOpen] = useState(false);

  const navigate = (next: Page) => {
    setPage(next);
    setScenario('normal');
  };
  let content: ReactNode;
  if (page === '工作台') content = <Dashboard navigate={navigate} />;
  else if (page === '查价')
    content = (
      <QuotePage
        choose={() => {
          setSelectedQuote(true);
          navigate('新建运单');
        }}
      />
    );
  else if (page === '新建运单')
    content = (
      <OrderPage
        selectedQuote={selectedQuote}
        onSubmitted={() => setToast('预报已提交：S2505120006，仓库将等待收货。')}
      />
    );
  else if (page === '我的运单') content = <WaybillsPage onTrack={() => navigate('轨迹查询')} />;
  else if (page === '轨迹查询') content = <TrackingPage />;
  else if (page === '账单与付款')
    content = <FinancePage requestPayment={() => setPaymentOpen(true)} />;
  else if (page === '问题工单') content = <TicketsPage notify={setToast} />;
  else if (page === 'API') content = <ApiPage notify={setToast} />;
  else content = <PlaceholderPage page={page} />;

  return (
    <div className="portal-shell">
      <aside className="portal-sidebar">
        <div className="portal-brand">
          <span>智</span>智立科技物流AI系统
        </div>
        <nav aria-label="客户门户导航">
          {navigation.map((item) => (
            <button
              key={item}
              data-active={page === item || undefined}
              onClick={() => navigate(item)}
            >
              <span aria-hidden="true">
                {item === '工作台' ? '⌂' : item === '新建运单' ? '＋' : item === '查价' ? '⌕' : '□'}
              </span>
              {item}
            </button>
          ))}
        </nav>
        <div className="portal-profile">
          <span>张</span>
          <div>
            <strong>张伟</strong>
            <small>深圳鑫源贸易有限公司</small>
          </div>
        </div>
      </aside>
      <div className="portal-content">
        <header>
          <button className="portal-menu" aria-label="折叠菜单">
            ☰
          </button>
          <input aria-label="全局搜索" placeholder="运单号 / 主运单号 / 参考号" />
          <label className="portal-scenario">
            演示状态
            <select
              aria-label="演示状态"
              value={scenario}
              onChange={(event) => setScenario(event.target.value as Scenario)}
            >
              <option value="normal">正常</option>
              <option value="loading">加载</option>
              <option value="empty">空数据</option>
              <option value="failed">失败</option>
              <option value="forbidden">无权限</option>
              <option value="stale">数据过期</option>
              <option value="partial">部分成功</option>
            </select>
          </label>
          <strong>深圳鑫源贸易有限公司</strong>
        </header>
        <main>
          <ScenarioNotice scenario={scenario} />
          {scenario === 'empty' ? null : content}
        </main>
      </div>
      {toast ? (
        <div className="portal-toast" role="status">
          <span>{toast}</span>
          <button aria-label="关闭提示" onClick={() => setToast('')}>
            ×
          </button>
        </div>
      ) : null}
      <Dialog
        open={paymentOpen}
        title="确认支付"
        description="将创建微信支付订单。支付失败不会改变账单快照，可重新创建支付订单。"
        footer={
          <>
            <Button variant="secondary" onClick={() => setPaymentOpen(false)}>
              取消
            </Button>
            <Button
              onClick={() => {
                setPaymentOpen(false);
                setToast('支付订单已创建：PAY-20260512-01，请在 15 分钟内完成。');
              }}
            >
              确认支付
            </Button>
          </>
        }
        onOpenChange={setPaymentOpen}
      >
        <div className="portal-danger">
          <strong>CNY 2,320.00</strong>
          <span>账单 ST202605-0008 · 仅核销本企业物流账单</span>
        </div>
      </Dialog>
      <nav className="portal-mobile-nav" aria-label="移动端导航">
        {(['工作台', '新建运单', '我的运单', '账单与付款', '问题工单'] as Page[]).map((item) => (
          <button key={item} onClick={() => navigate(item)}>
            {item === '工作台'
              ? '首页'
              : item === '新建运单'
                ? '下单'
                : item === '我的运单'
                  ? '运单'
                  : item === '账单与付款'
                    ? '账单'
                    : '我的'}
          </button>
        ))}
      </nav>
    </div>
  );
}
