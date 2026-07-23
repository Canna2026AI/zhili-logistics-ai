import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Button, Drawer, StatusTag } from '@zhili/ui';
import { customerPort, type OrderInput, type QuoteResult, type VersionDifference } from './api';
import { customerBillingRecords, customerExceptionRecords } from './customer-records';
import { AccountFlow } from './features/account/account-flow';
import { BillingFlow } from './features/billing/billing-flow';
import { ExceptionFlow } from './features/exceptions/exception-flow';
import { ShipmentFlow } from './features/shipments/shipment-flow';
import { TrackingFlow } from './features/tracking/tracking-flow';

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

const navigationContext: Record<Page, string> = {
  工作台: '客户工作台与快捷操作',
  新建运单: '创建运输订单与保存草稿',
  批量导入: '上传 CSV 或 Excel 运单',
  查价: '多渠道报价与规则版本',
  我的运单: '当前企业运单列表',
  轨迹查询: '运单事件与来源时间线',
  账单与付款: '账单、预存款与付款记录',
  问题工单: '客户可见问题与补充资料',
  地址簿: '当前企业联系人地址',
  API: '最小权限 API 申请',
};

type SearchResult = {
  id: string;
  type: '页面' | '运单' | '工单' | '账单' | '付款' | '地址';
  label: string;
  context: string;
  page: Page;
  waybillNo?: string;
};

type WaybillRow = [string, string, string, string, string, string, string];
const waybillSeed: WaybillRow[] = [
  ['S2505120001', 'HBL2505120001', '运输中', '英国/洛杉矶', '20', '12,340.50', '在港装船'],
  ['S2505120002', 'HBL2505120002', '待收货', '德国/法兰克福', '5', '320.00', '到达仓库'],
  ['S2505120003', 'HBL2505120003', '运输中', '美国/伦敦', '8', '1,250.30', '离港'],
  ['S2505120004', 'HBL2505120004', '已收货，待分货', '澳大利亚/悉尼', '18', '123.50', '已收货'],
  ['S2505120005', 'HBL2505120005', '运输中', '俄罗斯/莫斯科', '12', '6,500.00', '中转中'],
];
const storageKey = (tenantId: string, customerId: string, area: string) =>
  `zhili.customer.${tenantId}.${customerId}.${area}`;
const readRows = (key: string) => {
  try {
    return JSON.parse(localStorage.getItem(key) ?? '') as WaybillRow[];
  } catch {
    return waybillSeed;
  }
};
const readStringList = (key: string, fallback: string[]) => {
  try {
    return JSON.parse(localStorage.getItem(key) ?? JSON.stringify(fallback)) as string[];
  } catch {
    return fallback;
  }
};

function ScenarioNotice({
  scenario,
  recoveryMessage,
  differences,
  recovering,
  recover,
  applyServerVersion,
}: {
  scenario: Scenario;
  recoveryMessage: string;
  differences: VersionDifference[];
  recovering: boolean;
  recover: () => void;
  applyServerVersion: () => void;
}) {
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
    partial: {
      role: 'status',
      text: '部分成功：4 项完成、1 项失败；失败项 notification-5。仅重试失败项。',
    },
  };
  const notice = notices[scenario];
  return (
    <div className={`portal-notice portal-notice--${scenario}`} role={notice.role}>
      <span>
        {notice.text}
        {differences.length ? (
          <span>
            {' '}
            版本差异：
            {differences.map((difference) => (
              <span key={difference.field}>
                {difference.field} {difference.local} → {difference.server}
              </span>
            ))}
          </span>
        ) : null}
        {recoveryMessage ? ` ${recoveryMessage}` : ''}
      </span>
      {scenario === 'stale' && differences.length ? (
        <button disabled={recovering} onClick={applyServerVersion}>
          应用服务器版本
        </button>
      ) : (
        <button
          disabled={recovering || scenario === 'loading' || scenario === 'empty'}
          onClick={recover}
        >
          {recovering
            ? '处理中…'
            : scenario === 'partial'
              ? '仅重试失败项'
              : scenario === 'stale'
                ? '刷新并比较'
                : '重试'}
        </button>
      )}
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

const shortcutSeed: Array<[Page, string, string]> = [
  ['新建运单', '新建运单', '创建运输订单'],
  ['批量导入', '批量导入', 'Excel 批量导入'],
  ['查价', '立即查价', '快速获取报价'],
  ['账单与付款', '提交付款凭证', '上传凭证并关联'],
];

function Dashboard({
  navigate,
  rows,
  notify,
  shortcutsKey,
}: {
  navigate: (page: Page) => void;
  rows: WaybillRow[];
  notify: (message: string) => void;
  shortcutsKey: string;
}) {
  const [editingShortcuts, setEditingShortcuts] = useState(false);
  const [shortcutPages, setShortcutPages] = useState<Page[]>(() => {
    try {
      return JSON.parse(
        localStorage.getItem(shortcutsKey) ?? JSON.stringify(shortcutSeed.map(([p]) => p))
      ) as Page[];
    } catch {
      return shortcutSeed.map(([page]) => page);
    }
  });
  const saveShortcuts = (next: Page[]) =>
    void customerPort
      .saveShortcuts(next)
      .then(() => {
        localStorage.setItem(shortcutsKey, JSON.stringify(next));
        setShortcutPages(next);
        notify('快捷入口布局已保存。');
      })
      .catch((error: Error) => notify(error.message));
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
            <button aria-label="快速查价" onClick={() => navigate('查价')}>
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
                aria-label={`${label} ${value} 较昨日 ${delta}`}
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
            <WaybillTable rows={rows} onTrack={() => navigate('轨迹查询')} compact />
          </div>
          <section className="portal-secondary-actions" aria-label="可编辑快捷入口">
            <div>
              <h2>快捷入口（可编辑）</h2>
              <button onClick={() => setEditingShortcuts((value) => !value)}>
                {editingShortcuts ? '完成编辑' : '编辑'}
              </button>
            </div>
            {editingShortcuts ? (
              <p>
                点击入口可隐藏；已显示 {shortcutPages.length} 项。
                <button onClick={() => saveShortcuts(shortcutSeed.map(([page]) => page))}>
                  恢复默认
                </button>
              </p>
            ) : null}
            <nav data-editing={editingShortcuts || undefined}>
              {shortcutSeed
                .filter(([page]) => shortcutPages.includes(page))
                .map(([page, label, note]) => (
                  <button
                    key={page}
                    aria-label={editingShortcuts ? `隐藏 ${label}` : label}
                    onClick={() =>
                      editingShortcuts
                        ? saveShortcuts(shortcutPages.filter((item) => item !== page))
                        : navigate(page)
                    }
                  >
                    <strong>{label}</strong>
                    <small>{editingShortcuts ? '点击隐藏此入口' : note}</small>
                  </button>
                ))}
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

function QuotePage({ choose, now }: { choose: (quote: QuoteResult) => void; now: () => number }) {
  const [quote, setQuote] = useState<QuoteResult | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState('');
  const [currentTime, setCurrentTime] = useState(now);
  const [serverExpired, setServerExpired] = useState(false);
  useEffect(() => {
    if (!quote) return;
    const timer = window.setInterval(() => setCurrentTime(now()), 500);
    return () => window.clearInterval(timer);
  }, [now, quote]);
  const expired = quote
    ? serverExpired || new Date(quote.validUntil).getTime() <= currentTime
    : false;
  const resetQuote = () => {
    setQuote(null);
    setError('');
    setServerExpired(false);
  };
  const accept = async () => {
    if (!quote) return;
    if (new Date(quote.validUntil).getTime() <= now()) {
      setCurrentTime(now());
      return;
    }
    setAccepting(true);
    setError('');
    try {
      choose(await customerPort.acceptQuote(quote));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '报价接受失败，请重试。');
      if (reason instanceof Error && 'code' in reason && reason.code === 'QUOTE_EXPIRED')
        setServerExpired(true);
    } finally {
      setAccepting(false);
    }
  };
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
          const form = new FormData(event.currentTarget);
          setSubmitting(true);
          setError('');
          void customerPort
            .quote(
              {
                origin: String(form.get('origin')),
                destinationPostalCode: String(form.get('destinationPostalCode')) || '90001',
                weightKg: Number(form.get('weightKg')),
                volumeM3: Number(form.get('volumeM3')),
              },
              now
            )
            .then((result) => {
              setCurrentTime(now());
              setQuote(result);
            })
            .catch((reason: Error) => setError(reason.message))
            .finally(() => setSubmitting(false));
        }}
      >
        <label>
          始发地
          <input name="origin" defaultValue="CN-SZX" required />
        </label>
        <label>
          目的地邮编
          <input name="destinationPostalCode" aria-label="目的地邮编" />
        </label>
        <label>
          实重（kg）
          <input name="weightKg" defaultValue="123.50" inputMode="decimal" required />
        </label>
        <label>
          体积（m³）
          <input name="volumeM3" defaultValue="0.48" inputMode="decimal" required />
        </label>
        <Button type="submit" disabled={submitting}>
          {submitting ? '查价中…' : '获取报价'}
        </Button>
      </form>
      {error ? <p role="alert">{error}</p> : null}
      {quote ? (
        <section
          className="portal-panel portal-quote-result"
          aria-label={`报价 ${quote.quoteNo}`}
          aria-live="polite"
        >
          <div>
            <StatusTag tone={expired ? 'danger' : 'success'}>
              {expired ? '已过期' : '可用'}
            </StatusTag>
            <h2>{quote.channel}</h2>
            <p>
              {quote.request.origin} → {quote.request.destinationPostalCode} ·{' '}
              {quote.request.weightKg.toFixed(2)} kg · {quote.request.volumeM3.toFixed(2)} m³
            </p>
            <p>
              计费重 {quote.chargeableWeightKg.toFixed(2)} kg · {quote.zone} · 价卡{' '}
              {quote.rateCardVersion}
            </p>
          </div>
          <dl>
            <div>
              <dt>基础运费</dt>
              <dd>CNY {quote.charges.base}</dd>
            </div>
            <div>
              <dt>燃油附加费</dt>
              <dd>CNY {quote.charges.fuel}</dd>
            </div>
            <div>
              <dt>偏远附加费</dt>
              <dd>CNY {quote.charges.remote}</dd>
            </div>
            <div>
              <dt>操作费</dt>
              <dd>CNY {quote.charges.handling}</dd>
            </div>
            <div>
              <dt>合计</dt>
              <dd>CNY {quote.charges.total}</dd>
            </div>
          </dl>
          <div>
            <small>报价有效至 {quote.validUntil.slice(0, 16).replace('T', ' ')}</small>
            <Button disabled={expired || accepting} onClick={() => void accept()}>
              {accepting ? '正在接受…' : '选择此报价'}
            </Button>
            {expired ? (
              <Button variant="secondary" onClick={resetQuote}>
                按当前规则重新查价
              </Button>
            ) : null}
          </div>
        </section>
      ) : null}
    </>
  );
}

function WaybillTable({
  rows,
  onTrack,
  compact = false,
}: {
  rows: WaybillRow[];
  onTrack: (waybillNo: string) => void;
  compact?: boolean;
}) {
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
          {rows.map((row) => (
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
                <button aria-label={`查看轨迹 ${row[0]}`} onClick={() => onTrack(row[0])}>
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

function WaybillsPage({
  rows,
  onTrack,
  notify,
  companyName,
}: {
  rows: WaybillRow[];
  onTrack: (waybillNo: string) => void;
  notify: (message: string) => void;
  companyName: string;
}) {
  const [query, setQuery] = useState('');
  const [appliedQuery, setAppliedQuery] = useState('');
  const filtered = rows.filter((row) => row.join(' ').includes(appliedQuery));
  return (
    <>
      <SectionHeader
        title="我的运单"
        description={`仅显示${companyName}的数据范围，共 1,248 条。`}
        action={
          <Button
            onClick={() =>
              void customerPort
                .createExport()
                .then(() => notify(`导出任务已创建，共 ${filtered.length} 条。`))
                .catch((error: Error) => notify(error.message))
            }
          >
            导出当前结果
          </Button>
        }
      />
      <div className="portal-filter">
        <input
          aria-label="搜索运单"
          placeholder="运单号 / 主运单号 / 参考号"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <select aria-label="运单状态">
          <option>全部状态</option>
          <option>运输中</option>
          <option>已收货</option>
        </select>
        <Button variant="secondary" onClick={() => setAppliedQuery(query.trim())}>
          查询
        </Button>
      </div>
      <WaybillTable rows={filtered} onTrack={onTrack} />
    </>
  );
}

function ImportPage({ notify }: { notify: (message: string) => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState('');
  return (
    <>
      <SectionHeader title="批量导入" description="上传 CSV 或 Excel，逐行校验后提交。" />
      <section className="portal-panel portal-form">
        <label>
          导入文件
          <input
            aria-label="导入文件"
            type="file"
            accept=".csv,.xlsx"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          />
        </label>
        <Button
          disabled={!file}
          onClick={() =>
            file &&
            void customerPort
              .createImport(file.name)
              .then(() => {
                setResult('导入完成：1 行成功，0 行失败。');
                notify('导入完成：1 行成功，0 行失败。');
              })
              .catch((error: Error) => notify(error.message))
          }
        >
          开始导入
        </Button>
        {result ? <p>{result}</p> : null}
      </section>
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

type CustomerPortalProps = {
  tenantId?: string;
  customerId?: string;
  companyName?: string;
  now?: () => number;
  mockMode?: boolean;
};

function CustomerPortalApp({
  tenantId = 'tenant-xinyuan',
  customerId = 'customer-xinyuan',
  companyName = '深圳鑫源贸易有限公司',
  now = Date.now,
  mockMode = import.meta.env.MODE === 'test' ||
    (typeof window !== 'undefined' &&
      new URLSearchParams(window.location.search).get('mock') === '1'),
}: CustomerPortalProps) {
  const waybillsKey = storageKey(tenantId, customerId, 'waybills');
  const shortcutsKey = storageKey(tenantId, customerId, 'shortcuts');
  const draftKey = storageKey(tenantId, customerId, 'draft');
  const receiptKey = storageKey(tenantId, customerId, 'receipt');
  const addressesKey = storageKey(tenantId, customerId, 'addresses');
  const ordersKey = storageKey(tenantId, customerId, 'orders');
  const [page, setPage] = useState<Page>('工作台');
  const [scenario, setScenario] = useState<Scenario>('normal');
  const [selectedQuote, setSelectedQuote] = useState<QuoteResult | null>(null);
  const [toast, setToast] = useState('');
  const [recoveryMessage, setRecoveryMessage] = useState('');
  const [differences, setDifferences] = useState<VersionDifference[]>([]);
  const [recovering, setRecovering] = useState(false);
  const [mobileNavigationOpen, setMobileNavigationOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [activeSearchResult, setActiveSearchResult] = useState(0);
  const searchFormRef = useRef<HTMLFormElement>(null);
  const searchResultsRef = useRef<HTMLDivElement>(null);
  const activeSearchOptionRef = useRef<HTMLButtonElement>(null);
  const [rows, setRows] = useState<WaybillRow[]>(() => readRows(waybillsKey));
  const [trackingNo, setTrackingNo] = useState('S2505120004');
  const [draftSaved, setDraftSaved] = useState(() => localStorage.getItem(draftKey) === 'saved');
  useEffect(() => localStorage.setItem(waybillsKey, JSON.stringify(rows)), [rows, waybillsKey]);
  useEffect(() => {
    if (!searchOpen) return;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (searchFormRef.current?.contains(event.target as Node)) return;
      setSearchOpen(false);
    };
    document.addEventListener('pointerdown', closeOnOutsidePointer, true);
    return () => document.removeEventListener('pointerdown', closeOnOutsidePointer, true);
  }, [searchOpen]);
  const navigate = (next: Page) => {
    setPage(next);
    setScenario('normal');
    setRecoveryMessage('');
    setDifferences([]);
    setMobileNavigationOpen(false);
    setSearchOpen(false);
  };
  const searchIndex: SearchResult[] = [
    ...navigation.map((item) => ({
      id: `page-${item}`,
      type: '页面' as const,
      label: item,
      context: navigationContext[item],
      page: item,
    })),
    ...rows.map((row): SearchResult => ({
      id: `waybill-${row[0]}`,
      type: '运单',
      label: row[0],
      context: `${row[1]} · ${row[2]} · ${row[3]} · ${row[6]}`,
      page: '轨迹查询',
      waybillNo: row[0],
    })),
    {
      id: 'issue-T250512001',
      type: '工单',
      label: 'T250512001',
      context: '运单延误咨询 · 处理中',
      page: '问题工单',
    },
    {
      id: 'issue-T250511008',
      type: '工单',
      label: 'T250511008',
      context: '发票未收到 · 处理中',
      page: '问题工单',
    },
    {
      id: 'statement-ST202605-0008',
      type: '账单',
      label: 'ST202605-0008',
      context: '2026-05 · CNY 5,320.00 · 待付款 CNY 2,320.00',
      page: '账单与付款',
    },
    ...readStringList(addressesKey, ['深圳南山发货仓']).map((address, index): SearchResult => ({
      id: `address-${index}-${address}`,
      type: '地址',
      label: address,
      context: `${companyName} · 当前企业地址簿`,
      page: '地址簿',
    })),
  ];
  const normalizedSearchQuery = searchQuery.trim().toLocaleLowerCase('zh-CN');
  const searchResults = normalizedSearchQuery
    ? searchIndex.filter((result) =>
        `${result.type} ${result.label} ${result.context}`
          .toLocaleLowerCase('zh-CN')
          .includes(normalizedSearchQuery)
      )
    : [];
  const activeSearchResultId = searchResults[activeSearchResult]?.id;
  useLayoutEffect(() => {
    if (!searchOpen || !activeSearchResultId) return;
    const listbox = searchResultsRef.current;
    const option = activeSearchOptionRef.current;
    if (!listbox || !option) return;
    const listboxRect = listbox.getBoundingClientRect();
    const optionRect = option.getBoundingClientRect();
    if (optionRect.top < listboxRect.top) {
      listbox.scrollTop = Math.max(
        0,
        listbox.scrollTop - Math.ceil(listboxRect.top - optionRect.top)
      );
    } else if (optionRect.bottom > listboxRect.bottom) {
      listbox.scrollTop += Math.ceil(optionRect.bottom - listboxRect.bottom);
    }
  }, [activeSearchResultId, searchOpen]);
  const selectSearchResult = (result: SearchResult) => {
    if (result.waybillNo) setTrackingNo(result.waybillNo);
    setSearchQuery('');
    navigate(result.page);
  };
  const recover = async () => {
    setRecovering(true);
    setRecoveryMessage('');
    try {
      if (scenario === 'stale') {
        const result = await customerPort.compareDashboard('v12');
        setDifferences(result.differences);
      } else if (scenario === 'partial') {
        const result = await customerPort.retryFailedNotifications(['notification-5']);
        setScenario('normal');
        setToast(`仅重试失败项：${result.items.map((item) => item.id).join('、')} 已合并成功。`);
      } else {
        await customerPort.refreshDashboard();
        setScenario('normal');
        setToast('数据已从服务端重新加载。');
      }
    } catch (error) {
      setRecoveryMessage(error instanceof Error ? error.message : '恢复请求失败；原状态已保留。');
    } finally {
      setRecovering(false);
    }
  };
  const applyServerVersion = async () => {
    setRecovering(true);
    setRecoveryMessage('');
    try {
      const result = await customerPort.refreshDashboard('v13');
      setScenario('normal');
      setDifferences([]);
      setToast(`已应用服务器版本 ${result.version}。`);
    } catch (error) {
      setRecoveryMessage(error instanceof Error ? error.message : '刷新失败；本地版本未覆盖。');
    } finally {
      setRecovering(false);
    }
  };
  let content: ReactNode;
  if (page === '工作台')
    content = (
      <Dashboard navigate={navigate} rows={rows} notify={setToast} shortcutsKey={shortcutsKey} />
    );
  else if (page === '查价')
    content = (
      <QuotePage
        now={now}
        choose={(quote) => {
          setSelectedQuote(quote);
          navigate('新建运单');
        }}
      />
    );
  else if (page === '新建运单')
    content = (
      <ShipmentFlow
        mockMode={mockMode}
        selectedQuote={selectedQuote}
        draftSaved={draftSaved}
        now={now}
        onDraftSaved={() => {
          localStorage.setItem(draftKey, 'saved');
          setDraftSaved(true);
        }}
        onDraft={async (input) => {
          try {
            await customerPort.saveDraft(input);
            setToast('草稿已保存：DRAFT-S2505120006。');
          } catch (error) {
            setToast(error instanceof Error ? error.message : '草稿保存失败。');
            throw error;
          }
        }}
        onSubmitted={async (input) => {
          try {
            const order = await customerPort.createOrder(input);
            const newRow: WaybillRow = [
              order.orderNo,
              'HBL2505120006',
              '待收货',
              input.destination,
              String(input.pieces),
              input.weightKg.toFixed(2),
              '预报已提交',
            ];
            setRows((current) =>
              current.some((row) => row[0] === order.orderNo) ? current : [newRow, ...current]
            );
            const existing = (() => {
              try {
                return JSON.parse(localStorage.getItem(ordersKey) ?? '[]') as OrderInput[];
              } catch {
                return [];
              }
            })();
            localStorage.setItem(
              ordersKey,
              JSON.stringify([{ ...input, orderNo: order.orderNo }, ...existing])
            );
            setToast(`预报已提交：${order.orderNo}，仓库将等待收货。`);
          } catch (error) {
            setToast(error instanceof Error ? error.message : '预报提交失败。');
            throw error;
          }
        }}
      />
    );
  else if (page === '我的运单')
    content = (
      <WaybillsPage
        rows={rows}
        notify={setToast}
        companyName={companyName}
        onTrack={(waybillNo) => {
          setTrackingNo(waybillNo);
          navigate('轨迹查询');
        }}
      />
    );
  else if (page === '轨迹查询')
    content = <TrackingFlow waybillNo={trackingNo} notify={setToast} mockMode={mockMode} />;
  else if (page === '账单与付款')
    content = (
      <BillingFlow
        notify={setToast}
        receiptKey={receiptKey}
        records={customerBillingRecords}
        mockMode={mockMode}
      />
    );
  else if (page === '问题工单')
    content = (
      <ExceptionFlow
        notify={setToast}
        records={customerExceptionRecords}
        storageKey={`${receiptKey}:exceptions`}
        mockMode={mockMode}
      />
    );
  else if (page === 'API')
    content = (
      <AccountFlow
        key="api"
        initialStep="api"
        notify={setToast}
        addressesKey={addressesKey}
        companyName={companyName}
      />
    );
  else if (page === '批量导入') content = <ImportPage notify={setToast} />;
  else if (page === '地址簿')
    content = (
      <AccountFlow
        key="address"
        initialStep="address"
        notify={setToast}
        addressesKey={addressesKey}
        companyName={companyName}
      />
    );
  else content = <PlaceholderPage page={page} />;

  return (
    <div className="portal-shell">
      <aside className="portal-sidebar" inert={mobileNavigationOpen}>
        <div className="portal-brand">
          <span>智</span>智立科技物流AI系统
        </div>
        <nav aria-label="客户门户导航">
          {navigation.map((item) => (
            <button
              key={item}
              data-active={page === item || undefined}
              aria-current={page === item ? 'page' : undefined}
              disabled={scenario !== 'normal'}
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
            <small>{companyName}</small>
          </div>
        </div>
      </aside>
      <div className="portal-content" inert={mobileNavigationOpen}>
        <header>
          <button
            className="portal-menu"
            aria-label="折叠菜单"
            aria-haspopup="dialog"
            aria-controls="customer-mobile-navigation"
            aria-expanded={mobileNavigationOpen}
            disabled={scenario !== 'normal'}
            onClick={() => setMobileNavigationOpen(true)}
          >
            ☰
          </button>
          <form
            ref={searchFormRef}
            className="portal-global-search"
            role="search"
            onSubmit={(event) => {
              event.preventDefault();
              const result = searchResults[activeSearchResult] ?? searchResults[0];
              if (result) selectSearchResult(result);
            }}
          >
            <input
              role="combobox"
              type="search"
              aria-label="全局搜索"
              aria-autocomplete="list"
              aria-controls="customer-global-search-results"
              aria-expanded={Boolean(searchOpen && normalizedSearchQuery)}
              aria-activedescendant={
                searchOpen && searchResults.length
                  ? `customer-search-result-${searchResults[activeSearchResult]?.id ?? searchResults[0]?.id}`
                  : undefined
              }
              autoComplete="off"
              placeholder="搜索页面或业务记录"
              value={searchQuery}
              disabled={scenario !== 'normal'}
              onFocus={() => {
                if (normalizedSearchQuery) setSearchOpen(true);
              }}
              onChange={(event) => {
                setSearchQuery(event.target.value);
                setActiveSearchResult(0);
                setSearchOpen(Boolean(event.target.value.trim()));
              }}
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  event.preventDefault();
                  setSearchOpen(false);
                  return;
                }
                if (event.key === 'Tab') {
                  setSearchOpen(false);
                  return;
                }
                if (!searchResults.length) return;
                if (event.key === 'ArrowDown') {
                  event.preventDefault();
                  setSearchOpen(true);
                  setActiveSearchResult((current) =>
                    Math.min(current + 1, searchResults.length - 1)
                  );
                } else if (event.key === 'ArrowUp') {
                  event.preventDefault();
                  setSearchOpen(true);
                  setActiveSearchResult((current) => Math.max(current - 1, 0));
                }
              }}
            />
            {searchOpen && normalizedSearchQuery ? (
              <div className="portal-search-surface">
                <div
                  ref={searchResultsRef}
                  id="customer-global-search-results"
                  className="portal-search-results"
                  role="listbox"
                  aria-label="全局搜索结果"
                >
                  {searchResults.map((result, index) => (
                    <button
                      key={result.id}
                      ref={index === activeSearchResult ? activeSearchOptionRef : undefined}
                      id={`customer-search-result-${result.id}`}
                      type="button"
                      role="option"
                      tabIndex={-1}
                      aria-selected={index === activeSearchResult}
                      onMouseEnter={() => setActiveSearchResult(index)}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => selectSearchResult(result)}
                    >
                      <strong>
                        {result.type} {result.label}
                      </strong>
                      <span>{result.context}</span>
                    </button>
                  ))}
                </div>
                {searchResults.length === 0 ? (
                  <p className="portal-search-empty" role="status" aria-label="全局搜索状态">
                    未找到匹配结果
                    <span>请检查运单号、业务编号或页面名称。</span>
                  </p>
                ) : null}
              </div>
            ) : null}
          </form>
          {mockMode ? (
            <label className="portal-scenario">
              演示状态
              <select
                aria-label="演示状态"
                value={scenario}
                onChange={(event) => {
                  setScenario(event.target.value as Scenario);
                  setMobileNavigationOpen(false);
                  setSearchOpen(false);
                }}
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
          ) : null}
          <strong>{companyName}</strong>
        </header>
        <main>
          <ScenarioNotice
            scenario={scenario}
            recoveryMessage={recoveryMessage}
            differences={differences}
            recovering={recovering}
            recover={() => void recover()}
            applyServerVersion={() => void applyServerVersion()}
          />
          {scenario === 'normal' ? content : null}
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
      <Drawer
        open={mobileNavigationOpen}
        title="客户门户菜单"
        size={480}
        onOpenChange={setMobileNavigationOpen}
      >
        <nav
          id="customer-mobile-navigation"
          className="portal-mobile-drawer-nav"
          aria-label="移动端完整导航"
        >
          {navigation.map((item) => (
            <button
              key={item}
              type="button"
              data-active={page === item || undefined}
              aria-label={item}
              aria-current={page === item ? 'page' : undefined}
              disabled={scenario !== 'normal'}
              onClick={() => navigate(item)}
            >
              <strong>{item}</strong>
              <span>{navigationContext[item]}</span>
            </button>
          ))}
        </nav>
      </Drawer>
      <nav className="portal-mobile-nav" aria-label="移动端导航" inert={mobileNavigationOpen}>
        {(['工作台', '新建运单', '我的运单', '账单与付款', '问题工单'] as Page[]).map((item) => (
          <button
            key={item}
            aria-current={page === item ? 'page' : undefined}
            disabled={scenario !== 'normal'}
            onClick={() => navigate(item)}
          >
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

export function App(props: CustomerPortalProps = {}) {
  const tenantId = props.tenantId ?? 'tenant-xinyuan';
  const customerId = props.customerId ?? 'customer-xinyuan';
  return <CustomerPortalApp key={`${tenantId}:${customerId}`} {...props} />;
}
