import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Button, Dialog, Drawer, StatusTag } from '@zhili/ui';
import { platformPort } from './api';
import { OperationsPage, type OperationsPageName } from './features/operations/operations-page';
import { AccessWorkflow } from './features/policies/access-workflow';
import {
  createAccessPolicyCatalog,
  type AccessPolicyBaselineRefresh,
  type AccessPolicyCatalog,
  type AccessPolicyDraft,
} from './features/policies/access-policy';
import { SessionOutcome, type SessionOutcomeKind } from './features/sessions/session-outcome';

type Page =
  | '租户管理'
  | '套餐与模块'
  | '配额与用量'
  | '平台公告'
  | '代入与审计'
  | '运行中心'
  | OperationsPageName;
type RuntimeState = 'normal' | 'loading' | 'empty' | 'failed' | 'forbidden' | 'stale' | 'partial';
type Tenant = {
  id: string;
  name: string;
  slug: string;
  plan: string;
  users: number;
  waybill: string;
  api: string;
  expires: string;
  days: number;
  health: '健康' | '警告' | '异常';
  status: 'ACTIVE' | 'SUSPENDED';
  version: number;
};
type Impersonation = {
  id: string;
  permissionsVersion: number;
  tenant: Tenant;
  reason: string;
  expiresAt: number;
};
type AuditRecord = {
  id: string;
  time: string;
  actor: string;
  tenant: string;
  action: string;
  reason: string;
  result: string;
};
type SearchResult = {
  id: string;
  label: string;
  type: '页面' | '租户' | '模块' | '公告' | '审计记录' | '运行作业';
  context: string;
  page: Page;
  tenantId?: string;
  keywords?: string;
};

const tenantSeed: Tenant[] = [
  {
    id: '01JTENANT0000000000000001',
    name: '上海智立科技有限公司',
    slug: 'zhili-sh',
    plan: '企业版',
    users: 86,
    waybill: '320,000 / 500,000',
    api: '2.45M / 10M',
    expires: '2026-08-31',
    days: 184,
    health: '健康',
    status: 'ACTIVE',
    version: 1,
  },
  {
    id: '01JTENANT0000000000000002',
    name: '深圳海运通物流有限公司',
    slug: 'seatrans-sz',
    plan: '专业版',
    users: 46,
    waybill: '120,000 / 200,000',
    api: '1.12M / 5M',
    expires: '2026-07-15',
    days: 137,
    health: '健康',
    status: 'ACTIVE',
    version: 1,
  },
  {
    id: '01JTENANT0000000000000003',
    name: '宁波迅达国际货运代理',
    slug: 'xunda-nb',
    plan: '基础版',
    users: 18,
    waybill: '40,000 / 100,000',
    api: '268K / 2M',
    expires: '2026-06-20',
    days: 112,
    health: '警告',
    status: 'ACTIVE',
    version: 1,
  },
  {
    id: '01JTENANT0000000000000004',
    name: '广州港捷供应链管理',
    slug: 'gangjie-gz',
    plan: '企业版',
    users: 102,
    waybill: '680,000 / 800,000',
    api: '3.85M / 15M',
    expires: '2026-01-10',
    days: 16,
    health: '异常',
    status: 'ACTIVE',
    version: 1,
  },
  {
    id: '01JTENANT0000000000000005',
    name: '青岛北方国际物流',
    slug: 'bf-logistics-qd',
    plan: '专业版',
    users: 37,
    waybill: '180,000 / 300,000',
    api: '821K / 5M',
    expires: '2026-09-05',
    days: 189,
    health: '健康',
    status: 'ACTIVE',
    version: 1,
  },
];
const readTenants = () => {
  try {
    return JSON.parse(localStorage.getItem('zhili.platform.tenants') ?? '') as Tenant[];
  } catch {
    return tenantSeed;
  }
};
const readSession = () => {
  try {
    const session = JSON.parse(
      localStorage.getItem('zhili.platform.impersonation') ?? ''
    ) as Impersonation;
    return session;
  } catch {
    return null;
  }
};

const pages: Page[] = [
  '租户管理',
  '套餐与模块',
  '配额与用量',
  '平台公告',
  '代入与审计',
  '运行中心',
];
const operationPages: OperationsPageName[] = ['系统健康', '任务与队列', '审计日志', '版本发布'];
const modules = [
  '运单管理',
  '仓库扫描',
  '订舱/提单',
  '尾程派送与 POD',
  '轨迹与问题件',
  '应收应付与微信支付',
  '数据分析',
  '客户门户',
  '自动化',
];
const announcementSeed = ['2026 年 5 月例行维护通知'];
const auditSeed: AuditRecord[] = [
  {
    id: 'audit-impersonation',
    time: '2026-05-12 10:21',
    actor: '张伟（admin）',
    tenant: '上海智立科技有限公司',
    action: '以管理员身份代入（60 分钟）',
    reason: '协助排查订单同步问题',
    result: '已审计',
  },
  {
    id: 'audit-entitlement',
    time: '2026-05-10 15:42',
    actor: '系统',
    tenant: '广州港捷供应链管理',
    action: '授权变更',
    reason: '开启模块「自动化」',
    result: '完成',
  },
];
const runtimeServices = [
  { id: 'runtime-payment', label: '支付回调' },
  { id: 'runtime-ups', label: 'UPS 轨迹同步' },
  { id: 'runtime-dhl', label: 'DHL 下单' },
];
const readAnnouncements = () => {
  try {
    return JSON.parse(
      localStorage.getItem('zhili.platform.announcements') ?? JSON.stringify(announcementSeed)
    ) as string[];
  } catch {
    return announcementSeed;
  }
};

function pageAvailable(page: Page, impersonating: boolean) {
  return !impersonating || page === '代入与审计' || page === '运行中心';
}

const interactionKey = () => `platform-ui-${crypto.randomUUID?.() ?? Date.now()}`;
const searchDomId = (value: string) => {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  let hash = 0;
  for (const character of value) hash = (hash * 31 + (character.codePointAt(0) ?? 0)) >>> 0;
  return `platform-search-result-${slug || 'item'}-${hash.toString(36)}`;
};

function GlobalSearch({
  results,
  value,
  onChange,
  onSelect,
}: {
  results: SearchResult[];
  value: string;
  onChange: (value: string) => void;
  onSelect: (result: SearchResult) => void;
}) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const hasQuery = Boolean(value.trim());
  const expanded = open && hasQuery;
  const select = (index: number) => {
    const result = results[index];
    if (!result) return;
    onSelect(result);
    setOpen(false);
    setActiveIndex(-1);
  };

  return (
    <form
      className="platform-global-search"
      role="search"
      onSubmit={(event) => {
        event.preventDefault();
        select(activeIndex >= 0 ? activeIndex : 0);
      }}
    >
      <input
        type="search"
        role="combobox"
        aria-label="平台全局搜索"
        aria-autocomplete="list"
        aria-controls="platform-global-search-results"
        aria-expanded={expanded}
        aria-activedescendant={
          expanded && activeIndex >= 0 ? searchDomId(results[activeIndex]!.id) : undefined
        }
        placeholder="搜索租户、作业或审计记录"
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
          setOpen(true);
          setActiveIndex(-1);
        }}
        onFocus={() => hasQuery && setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            if (!expanded) return;
            event.preventDefault();
            event.stopPropagation();
            setOpen(false);
            setActiveIndex(-1);
          } else if (event.key === 'ArrowDown' && results.length) {
            event.preventDefault();
            setOpen(true);
            setActiveIndex((current) => (current + 1) % results.length);
          } else if (event.key === 'ArrowUp' && results.length) {
            event.preventDefault();
            setOpen(true);
            setActiveIndex((current) => (current <= 0 ? results.length - 1 : current - 1));
          } else if (event.key === 'Enter' && expanded) {
            event.preventDefault();
            select(activeIndex >= 0 ? activeIndex : 0);
          }
        }}
      />
      {expanded ? (
        <div className="platform-search-popover">
          {results.length ? (
            <div id="platform-global-search-results" role="listbox" aria-label="平台全局搜索结果">
              {results.map((result, index) => (
                <button
                  id={searchDomId(result.id)}
                  key={result.id}
                  type="button"
                  role="option"
                  tabIndex={-1}
                  aria-selected={activeIndex === index}
                  aria-label={`${result.label}，${result.type}，${result.context}`}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => select(index)}
                >
                  <span>
                    <strong>{result.label}</strong>
                    <small>{result.context}</small>
                  </span>
                  <em>{result.type}</em>
                </button>
              ))}
            </div>
          ) : (
            <p id="platform-global-search-results" role="status">
              未找到与“{value.trim()}”匹配的结果
            </p>
          )}
        </div>
      ) : null}
    </form>
  );
}

function Header({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="platform-heading">
      <div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {action}
    </div>
  );
}

function TenantDetail({
  tenant,
  changeStatus,
  onConfigure,
}: {
  tenant: Tenant;
  changeStatus: (status: 'ACTIVE' | 'SUSPENDED') => void;
  onConfigure: () => void;
}) {
  return (
    <div className="platform-detail">
      <div className="platform-identity">
        <span>企</span>
        <div>
          <strong>{tenant.name}</strong>
          <small>{tenant.slug}</small>
        </div>
        <StatusTag tone={tenant.status === 'ACTIVE' ? 'success' : 'danger'}>
          {tenant.status === 'ACTIVE' ? '正常' : '已停用'}
        </StatusTag>
      </div>
      <dl className="platform-kv">
        <div>
          <dt>版本</dt>
          <dd>{tenant.plan}</dd>
        </div>
        <div>
          <dt>到期时间</dt>
          <dd>
            {tenant.expires}（还有 {tenant.days} 天）
          </dd>
        </div>
      </dl>
      <Button
        variant={tenant.status === 'ACTIVE' ? 'danger' : 'secondary'}
        onClick={() => changeStatus(tenant.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE')}
      >
        {tenant.status === 'ACTIVE' ? '停用租户' : '恢复租户'}
      </Button>
      <Button onClick={onConfigure}>配置授权与策略</Button>
      <section>
        <h3>模块授权</h3>
        {modules.map((module) => (
          <div className="platform-module-row" key={module}>
            <span>{module}</span>
            <StatusTag tone="success">已启用</StatusTag>
          </div>
        ))}
      </section>
      <section>
        <h3>配额与用量（本月）</h3>
        <Quota label="运单配额" value={tenant.waybill} percent={64} />
        <Quota label="API 用量" value={tenant.api} percent={24} />
        <Quota label="活跃用户" value={`${tenant.users} / 120`} percent={72} />
        <Quota label="存储用量" value="182 GB / 500 GB" percent={36} />
      </section>
    </div>
  );
}

function Quota({ label, value, percent }: { label: string; value: string; percent: number }) {
  return (
    <div className="platform-quota">
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
        <small>{percent}%</small>
      </div>
      <i>
        <b style={{ width: `${percent}%` }} />
      </i>
    </div>
  );
}

function TenantsPage({
  tenants,
  search,
  setSearch,
  onCreate,
  onDetail,
  onImpersonate,
}: {
  tenants: Tenant[];
  search: string;
  setSearch: (value: string) => void;
  onCreate: () => void;
  onDetail: (tenant: Tenant) => void;
  onImpersonate: (tenant: Tenant) => void;
}) {
  const [planFilter, setPlanFilter] = useState('全部版本');
  const [healthFilter, setHealthFilter] = useState('健康状态');
  const visible = tenants.filter(
    (tenant) =>
      (planFilter === '全部版本' || tenant.plan === planFilter) &&
      (healthFilter === '健康状态' || tenant.health === healthFilter)
  );
  return (
    <>
      <Header
        title="租户管理"
        description="套餐、模块、配额、健康与到期统一管理。"
        action={<Button onClick={onCreate}>新建租户</Button>}
      />
      <section className="platform-stats">
        {[
          ['活跃租户', '128', '较上月 +6'],
          ['本月即将到期', '9', '7 天内到期'],
          ['API 用量（本月）', '12.42M', '较上月 +18.7%'],
          ['作业失败（本月）', '384', '较上月 -6.3%'],
        ].map(([label, value, note]) => (
          <div key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
            <small>{note}</small>
          </div>
        ))}
      </section>
      <div className="platform-toolbar">
        <Button onClick={onCreate}>新建租户</Button>
        <input
          aria-label="搜索租户"
          placeholder="搜索租户名称 / SLUG"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <select
          aria-label="套餐筛选"
          value={planFilter}
          onChange={(event) => setPlanFilter(event.target.value)}
        >
          <option>全部版本</option>
          <option>企业版</option>
          <option>专业版</option>
          <option>基础版</option>
        </select>
        <select
          aria-label="健康筛选"
          value={healthFilter}
          onChange={(event) => setHealthFilter(event.target.value)}
        >
          <option>健康状态</option>
          <option>健康</option>
          <option>警告</option>
          <option>异常</option>
        </select>
        <Button
          variant="secondary"
          onClick={() => {
            setSearch('');
            setPlanFilter('全部版本');
            setHealthFilter('健康状态');
          }}
        >
          重置
        </Button>
      </div>
      <div className="platform-table-wrap">
        <table className="platform-table" aria-label="租户列表">
          <thead>
            <tr>
              <th>租户</th>
              <th>版本</th>
              <th>已启用模块</th>
              <th>活跃用户</th>
              <th>运单配额</th>
              <th>API 用量（本月）</th>
              <th>到期时间</th>
              <th>健康状态</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((tenant) => (
              <tr key={tenant.id}>
                <td>
                  <button
                    className="platform-tenant-link"
                    aria-label={`查看租户 ${tenant.name}`}
                    onClick={() => onDetail(tenant)}
                  >
                    <strong>{tenant.name}</strong>
                    <small>{tenant.slug}</small>
                  </button>
                </td>
                <td>
                  <StatusTag tone="info">{tenant.plan}</StatusTag>
                </td>
                <td>
                  运 仓 轨 财 <small>+6</small>
                </td>
                <td>{tenant.users}</td>
                <td>
                  <QuotaCell value={tenant.waybill} percent={tenant.id === '4' ? 85 : 64} />
                </td>
                <td>
                  <QuotaCell value={tenant.api} percent={24} />
                </td>
                <td>
                  {tenant.expires}
                  <small>还有 {tenant.days} 天</small>
                </td>
                <td>
                  <StatusTag
                    tone={
                      tenant.health === '健康'
                        ? 'success'
                        : tenant.health === '警告'
                          ? 'warning'
                          : 'danger'
                    }
                  >
                    {tenant.health}
                  </StatusTag>
                </td>
                <td>
                  <button
                    className="platform-link"
                    aria-label={`代入 ${tenant.name}`}
                    onClick={() => onImpersonate(tenant)}
                  >
                    代入
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function QuotaCell({ value, percent }: { value: string; percent: number }) {
  return (
    <div className="platform-quota-cell">
      <span>{value}</span>
      <i>
        <b style={{ width: `${percent}%` }} />
      </i>
    </div>
  );
}

function ModulesPage({
  tenant,
  updateTenantVersion,
  notify,
}: {
  tenant: Tenant;
  updateTenantVersion: (version: number) => void;
  notify: (text: string) => void;
}) {
  const [enabled, setEnabled] = useState<Record<string, boolean>>(() =>
    (() => {
      try {
        return JSON.parse(localStorage.getItem('zhili.platform.modules') ?? '') as Record<
          string,
          boolean
        >;
      } catch {
        return Object.fromEntries(modules.map((item) => [item, true]));
      }
    })()
  );
  const [plan, setPlan] = useState('企业版');
  const [plans, setPlans] = useState(['企业版', '专业版', '基础版']);
  return (
    <>
      <Header
        title="套餐与模块"
        description="按套餐定义默认能力，租户覆盖会记录版本和操作者。"
        action={
          <Button
            onClick={() => {
              void platformPort
                .createPlan('定制版')
                .then(() => {
                  if (!plans.includes('定制版')) setPlans((items) => [...items, '定制版']);
                  setPlan('定制版');
                  notify('新套餐草稿“定制版”已创建。');
                })
                .catch((error: Error) => notify(error.message));
            }}
          >
            新建套餐
          </Button>
        }
      />
      <section className="platform-plan-grid">
        <aside>
          {plans.map((item) => (
            <button
              key={item}
              data-active={plan === item || undefined}
              onClick={() => setPlan(item)}
            >
              {item}
            </button>
          ))}
        </aside>
        <div className="platform-panel">
          <div className="platform-panel-head">
            <div>
              <h2>{plan}模块授权</h2>
              <p>版本 PLAN-ENT-2026.05 · 已发布</p>
            </div>
            <StatusTag tone="success">生效中</StatusTag>
          </div>
          {modules.map((module) => (
            <label className="platform-switch-row" key={module}>
              <span>
                <strong>{module}</strong>
                <small>允许企业租户使用此模块及关联 API</small>
              </span>
              <input
                type="checkbox"
                role="switch"
                aria-label={module}
                checked={enabled[module]}
                onChange={() => {
                  const next = !enabled[module];
                  void platformPort
                    .setModuleEntitlement(tenant.id, tenant.version, module, next)
                    .then((version) => {
                      setEnabled((current) => {
                        const updated = { ...current, [module]: next };
                        localStorage.setItem('zhili.platform.modules', JSON.stringify(updated));
                        return updated;
                      });
                      updateTenantVersion(version);
                      notify('模块授权已保存，变更版本 PLAN-ENT-2026.06。');
                    })
                    .catch((error: Error) => notify(error.message));
                }}
              />
            </label>
          ))}
        </div>
      </section>
    </>
  );
}

function UsagePage({
  tenants,
  selectedTenantId,
  selectTenant,
  save,
  notify,
}: {
  tenants: Tenant[];
  selectedTenantId: string;
  selectTenant: (id: string) => void;
  save: (
    tenantId: string,
    version: number,
    config: { plan: string; limit: number; expires: string }
  ) => Promise<number>;
  notify: (text: string) => void;
}) {
  const tenant = tenants.find((item) => item.id === selectedTenantId) ?? tenants[0];
  const tenantLimit = tenant?.waybill.split('/')[1]?.replaceAll(',', '').trim() ?? '0';
  const [plan, setPlan] = useState(tenant?.plan ?? '基础版');
  const [limit, setLimit] = useState(tenantLimit);
  const [expires, setExpires] = useState(tenant?.expires ?? '');
  if (!tenant) return null;
  return (
    <>
      <Header title="配额与用量" description="运单、API、用户与存储配额均按租户隔离。" />
      <section className="platform-panel platform-usage">
        <label>
          配置租户
          <select
            aria-label="配置租户"
            value={tenant.id}
            onChange={(event) => selectTenant(event.target.value)}
          >
            {tenants.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <h2>{tenant.name}</h2>
        <form
          className="platform-create-form"
          onSubmit={(event) => {
            event.preventDefault();
            void save(tenant.id, tenant.version, { plan, limit: Number(limit), expires })
              .then((version) => {
                notify(`租户配置已保存，版本 ENT-${String(version).padStart(4, '0')}。`);
              })
              .catch((error: Error) => notify(error.message));
          }}
        >
          <label>
            租户套餐
            <select aria-label="租户套餐" value={plan} onChange={(e) => setPlan(e.target.value)}>
              <option>基础版</option>
              <option>专业版</option>
              <option>企业版</option>
            </select>
          </label>
          <label>
            运单配额上限
            <input
              aria-label="运单配额上限"
              value={limit}
              onChange={(event) => setLimit(event.target.value)}
              inputMode="numeric"
            />
          </label>
          <label>
            租户到期日
            <input
              aria-label="租户到期日"
              type="date"
              value={expires}
              onChange={(event) => setExpires(event.target.value)}
            />
          </label>
          <Button type="submit">保存租户配置</Button>
        </form>
        <Quota label="运单配额" value={tenant.waybill} percent={64} />
        <Quota label="API 用量" value={tenant.api} percent={24} />
        <Quota label="活跃用户" value={`${tenant.users} / 120`} percent={72} />
        <Quota label="存储用量" value="182 GB / 500 GB" percent={36} />
        <p>用量阈值 80% 预警、100% 限制写入；查看和导出仍保持可用。</p>
      </section>
    </>
  );
}

function AnnouncementsPage({
  announcements,
  addAnnouncement,
  notify,
}: {
  announcements: string[];
  addAnnouncement: (announcement: string) => void;
  notify: (text: string) => void;
}) {
  const [title, setTitle] = useState('');
  return (
    <>
      <Header title="平台公告" description="面向全部或指定租户发布维护、升级与合规通知。" />
      <section className="platform-announcement-grid">
        <form
          className="platform-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (!title.trim()) return;
            const next = title.trim();
            void platformPort
              .publishAnnouncement(next)
              .then(() => {
                addAnnouncement(next);
                setTitle('');
                notify('平台公告已发布。');
              })
              .catch((error: Error) => notify(error.message));
          }}
        >
          <label>
            公告标题
            <input
              aria-label="公告标题"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              required
            />
          </label>
          <label>
            范围
            <select>
              <option>全部租户</option>
              <option>指定租户</option>
            </select>
          </label>
          <label>
            正文
            <textarea defaultValue="系统将在低峰期进行例行维护。" />
          </label>
          <Button type="submit">发布公告</Button>
        </form>
        <div className="platform-panel">
          <h2>已发布公告</h2>
          {announcements.map((item, index) => (
            <article key={`${item}-${index}`}>
              <strong>{item}</strong>
              <small>全部租户 · 2026-05-12 10:20 · 张伟</small>
            </article>
          ))}
        </div>
      </section>
    </>
  );
}

function AuditPage({ records }: { records: AuditRecord[] }) {
  return (
    <>
      <Header title="代入与审计" description="代入时长、原因、操作对象和退出时间完整留痕。" />
      <div className="platform-table-wrap" tabIndex={0} aria-label="审计记录可滚动区域">
        <table className="platform-table" aria-label="审计记录">
          <thead>
            <tr>
              <th>时间</th>
              <th>操作者</th>
              <th>租户</th>
              <th>动作</th>
              <th>原因</th>
              <th>结果</th>
            </tr>
          </thead>
          <tbody>
            {records.map((record) => (
              <tr key={record.id}>
                <td>{record.time}</td>
                <td>{record.actor}</td>
                <td>{record.tenant}</td>
                <td>{record.action}</td>
                <td>{record.reason}</td>
                <td>
                  <StatusTag tone="success">{record.result}</StatusTag>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function RuntimeNotice({
  state,
  message,
  differences,
}: {
  state: RuntimeState;
  message: string;
  differences: Array<{ field: string; local: string; server: string }>;
}) {
  if (state === 'normal') return null;
  const map: Record<Exclude<RuntimeState, 'normal'>, [string, 'status' | 'alert']> = {
    loading: ['正在加载运行数据，超过 8 秒可转为后台任务。', 'status'],
    empty: ['当前时间范围没有作业记录。', 'status'],
    failed: ['运行数据请求失败：网关超时；请求号 REQ-P-384。', 'alert'],
    forbidden: ['缺少 platform.operations.read 权限，可向平台安全管理员申请。', 'status'],
    stale: ['运行快照已过期：本地 10:18，服务器 10:21。', 'status'],
    partial: [
      '部分作业执行失败：382 成功、2 失败；失败项 job-pay-382、job-pay-384，仅可重试失败项。',
      'status',
    ],
  };
  return (
    <div
      role={map[state][1]}
      className={`platform-runtime-notice platform-runtime-notice--${state}`}
    >
      {map[state][0]}
      {differences.length
        ? ` 版本差异：${differences
            .map((item) => `${item.field} ${item.local} → ${item.server}`)
            .join('；')}`
        : ''}
      {message ? ` ${message}` : ''}
    </div>
  );
}

function RuntimePage({ readOnly = false }: { readOnly?: boolean }) {
  const initialFailedIds = ['job-pay-382', 'job-pay-384'];
  const [state, setState] = useState<RuntimeState>('normal');
  const [message, setMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [failedItemIds, setFailedItemIds] = useState(initialFailedIds);
  const [differences, setDifferences] = useState<
    Array<{ field: string; local: string; server: string }>
  >([]);
  const [recovering, setRecovering] = useState(false);
  const selectState = (next: RuntimeState) => {
    setState(next);
    setMessage('');
    setSuccessMessage('');
    setDifferences([]);
    if (next === 'partial') setFailedItemIds(initialFailedIds);
  };
  const recover = async () => {
    setRecovering(true);
    setMessage('');
    try {
      if (state === 'stale') {
        if (differences.length) {
          await platformPort.refreshRuntime('runtime-v13');
          setState('normal');
          setDifferences([]);
        } else {
          const result = await platformPort.compareRuntime('runtime-v12');
          setDifferences(result.differences);
        }
      } else if (state === 'partial') {
        const result = await platformPort.retryRuntimeJobs(failedItemIds);
        const succeededIds = result.items
          .filter((item) => item.status === 'SUCCEEDED')
          .map((item) => item.id);
        const remainingIds = failedItemIds.filter((id) => !succeededIds.includes(id));
        setFailedItemIds(remainingIds);
        setState(remainingIds.length ? 'partial' : 'normal');
        setSuccessMessage(
          `${succeededIds.join('、')} 已合并成功，剩余失败 ${remainingIds.length} 项。`
        );
      } else {
        await platformPort.refreshRuntime();
        setState('normal');
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '恢复失败；原状态已保留。');
    } finally {
      setRecovering(false);
    }
  };
  return (
    <>
      <Header
        title="运行中心"
        description="作业、队列、连接器和回调运行状态可观察、可重试。"
        action={
          <label className="platform-runtime-select">
            运行状态
            <select
              aria-label="运行状态"
              value={state}
              onChange={(event) => selectState(event.target.value as RuntimeState)}
            >
              <option value="normal">正常</option>
              <option value="loading">加载</option>
              <option value="empty">空</option>
              <option value="failed">失败</option>
              <option value="forbidden">无权限</option>
              <option value="stale">过期</option>
              <option value="partial">部分成功</option>
            </select>
          </label>
        }
      />
      <RuntimeNotice state={state} message={message} differences={differences} />
      {successMessage ? <div role="status">{successMessage}</div> : null}
      {state === 'stale' ? (
        <Button disabled={readOnly || recovering} onClick={() => void recover()}>
          {differences.length ? '应用服务器快照' : '刷新运行快照'}
        </Button>
      ) : state === 'partial' ? (
        <Button disabled={readOnly || recovering} onClick={() => void recover()}>
          仅重试 2 个失败项
        </Button>
      ) : state === 'failed' ? (
        <Button disabled={readOnly || recovering} onClick={() => void recover()}>
          重试请求
        </Button>
      ) : null}
      {state === 'normal' || state === 'partial' ? (
        <>
          <section className="platform-runtime-stats">
            {[
              ['API 网关', '99.98%', '健康'],
              ['作业队列', '42', '正常'],
              ['连接器', '7 / 8', '警告'],
              [
                '失败作业',
                `${failedItemIds.length} / 384`,
                failedItemIds.length ? '需处理' : '健康',
              ],
            ].map(([label, value, status]) => (
              <div key={label}>
                <span>{label}</span>
                <strong>{value}</strong>
                <small>{status}</small>
              </div>
            ))}
          </section>
          <div className="platform-table-wrap" tabIndex={0} aria-label="运行作业可滚动区域">
            <table className="platform-table" aria-label="运行作业">
              <thead>
                <tr>
                  <th>服务</th>
                  <th>最近运行</th>
                  <th>成功</th>
                  <th>失败</th>
                  <th>耗时 P95</th>
                  <th>状态</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>{runtimeServices[0].label}</td>
                  <td>2026-05-12 10:21</td>
                  <td>{384 - failedItemIds.length}</td>
                  <td>{failedItemIds.length}</td>
                  <td>480ms</td>
                  <td>
                    <StatusTag tone={failedItemIds.length ? 'warning' : 'success'}>
                      {failedItemIds.length
                        ? `部分失败：${failedItemIds.length} / 384`
                        : '健康：0 / 384 失败'}
                    </StatusTag>
                  </td>
                </tr>
                {state === 'normal' ? (
                  <>
                    <tr>
                      <td>{runtimeServices[1].label}</td>
                      <td>2026-05-12 10:20</td>
                      <td>1,248</td>
                      <td>0</td>
                      <td>1.2s</td>
                      <td>
                        <StatusTag tone="success">健康</StatusTag>
                      </td>
                    </tr>
                    <tr>
                      <td>{runtimeServices[2].label}</td>
                      <td>2026-05-12 10:19</td>
                      <td>684</td>
                      <td>0</td>
                      <td>860ms</td>
                      <td>
                        <StatusTag tone="success">健康</StatusTag>
                      </td>
                    </tr>
                  </>
                ) : null}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </>
  );
}

export function App() {
  const [page, setPage] = useState<Page>('租户管理');
  const [tenantRows, setTenantRows] = useState<Tenant[]>(readTenants);
  const [search, setSearch] = useState('');
  const [globalSearch, setGlobalSearch] = useState('');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [detail, setDetail] = useState<Tenant | null>(null);
  const [workflowTenant, setWorkflowTenant] = useState<Tenant | null>(null);
  const [impersonate, setImpersonate] = useState<Tenant | null>(null);
  const [reason, setReason] = useState('协助排查订单同步问题');
  const [auditReason, setAuditReason] = useState('');
  const [announcements, setAnnouncements] = useState<string[]>(readAnnouncements);
  const [toast, setToast] = useState('');
  const [session, setSession] = useState<Impersonation | null>(readSession);
  const [sessionOutcome, setSessionOutcome] = useState<SessionOutcomeKind | null>(null);
  const [sessionEvidence, setSessionEvidence] = useState<{
    permissionsVersion?: number;
    eventId?: string;
  }>({});
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);
  const [newTenantName, setNewTenantName] = useState('');
  const [newTenantSlug, setNewTenantSlug] = useState('');
  const [newTenantPlan, setNewTenantPlan] = useState('专业版');
  const [selectedTenantId, setSelectedTenantId] = useState('01JTENANT0000000000000001');
  const [accessCatalogs, setAccessCatalogs] = useState<Record<string, AccessPolicyCatalog>>(() =>
    Object.fromEntries(tenantSeed.map((tenant) => [tenant.id, createAccessPolicyCatalog()]))
  );
  const [impersonationBusy, setImpersonationBusy] = useState(false);
  const impersonationPendingRef = useRef(false);
  const impersonationIntentRef = useRef<
    { fingerprint: string; idempotencyKey: string } | undefined
  >(undefined);
  const sessionRef = useRef(session);
  const accessSaveProgress = useRef<
    | {
        key: string;
        role?: {
          roleId: string;
          version: number;
          statements: AccessPolicyDraft['statements'];
        };
        tenantVersion?: number;
        roleKey: string;
        tenantKey: string;
      }
    | undefined
  >(undefined);
  const mockMode = new URLSearchParams(window.location.search).get('mock') === '1';
  useEffect(
    () => localStorage.setItem('zhili.platform.tenants', JSON.stringify(tenantRows)),
    [tenantRows]
  );
  useEffect(
    () => localStorage.setItem('zhili.platform.announcements', JSON.stringify(announcements)),
    [announcements]
  );
  useEffect(() => {
    if (session) localStorage.setItem('zhili.platform.impersonation', JSON.stringify(session));
    else localStorage.removeItem('zhili.platform.impersonation');
  }, [session]);
  useEffect(() => {
    sessionRef.current = session;
  }, [session]);
  const filtered = useMemo(
    () =>
      tenantRows.filter((tenant) =>
        `${tenant.name}${tenant.slug}`.toLowerCase().includes(search.toLowerCase())
      ),
    [search, tenantRows]
  );
  const auditRecords = useMemo<AuditRecord[]>(
    () => [
      {
        ...auditSeed[0],
        reason: auditReason || auditSeed[0].reason,
      },
      auditSeed[1],
    ],
    [auditReason]
  );
  const globalSearchResults = useMemo(() => {
    const index: SearchResult[] = [
      ...pages.map((item) => ({
        id: `page-${item}`,
        label: item,
        type: '页面' as const,
        context: '平台导航',
        page: item,
      })),
      ...operationPages.map((item) => ({
        id: `page-${item}`,
        label: item,
        type: '页面' as const,
        context: '系统运维',
        page: item,
      })),
      ...tenantRows.map((tenant) => ({
        id: `tenant-${tenant.id}`,
        label: tenant.name,
        type: '租户' as const,
        context: `${tenant.slug} · ${tenant.plan}`,
        page: '租户管理' as const,
        tenantId: tenant.id,
        keywords: `${tenant.health} ${tenant.status}`,
      })),
      ...modules.map((module) => ({
        id: `module-${module}`,
        label: module,
        type: '模块' as const,
        context: '套餐与模块',
        page: '套餐与模块' as const,
      })),
      ...announcements.map((announcement, index) => ({
        id: `announcement-${index}`,
        label: announcement,
        type: '公告' as const,
        context: '平台公告',
        page: '平台公告' as const,
      })),
      ...auditRecords.map((record) => ({
        id: record.id,
        label: record.action,
        context: `${record.tenant} · ${record.reason}`,
        type: '审计记录' as const,
        page: '代入与审计' as const,
      })),
      ...runtimeServices.map((service) => ({
        ...service,
        type: '运行作业' as const,
        context: '运行中心',
        page: '运行中心' as const,
      })),
    ];
    const query = globalSearch.trim().toLocaleLowerCase('zh-CN');
    if (!query) return [];
    return index
      .filter((result) => pageAvailable(result.page, Boolean(session)))
      .filter((result) =>
        `${result.label} ${result.type} ${result.context} ${result.keywords ?? ''}`
          .toLocaleLowerCase('zh-CN')
          .includes(query)
      )
      .slice(0, 8);
  }, [announcements, auditRecords, globalSearch, session, tenantRows]);
  const sessionId = session?.id;
  const sessionExpiresAt = session?.expiresAt;
  useEffect(() => {
    if (!sessionId || !sessionExpiresAt) return;
    let cancelled = false;
    let checking = false;
    const check = async () => {
      const current = sessionRef.current;
      if (!current || current.id !== sessionId || checking) return;
      checking = true;
      try {
        const status = await platformPort.checkImpersonation(
          current.id,
          current.permissionsVersion
        );
        if (cancelled) return;
        if (status.status === 'ACTIVE') {
          if (status.permissionsVersion !== current.permissionsVersion) {
            setSession((value) =>
              value?.id === current.id
                ? { ...value, permissionsVersion: status.permissionsVersion }
                : value
            );
          }
          return;
        }
        setSessionEvidence({
          permissionsVersion: status.permissionsVersion,
          eventId: status.eventId,
        });
        setSession(null);
        setSessionOutcome(status.status === 'REVOKED' ? 'revoked' : 'expired');
      } catch (error) {
        if (!cancelled) setToast(error instanceof Error ? error.message : '代入会话检查失败');
      } finally {
        checking = false;
      }
    };
    const update = () => {
      const remaining = Math.max(0, Math.ceil((sessionExpiresAt - Date.now()) / 1000));
      setRemainingSeconds(remaining);
      if (remaining === 0) {
        setSession(null);
        setSessionOutcome('expired');
        setToast('代入会话已过期，已安全返回平台上下文；未提交草稿已保留。');
      }
    };
    update();
    void check();
    const timer = window.setInterval(() => {
      update();
      void check();
    }, 1000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [sessionExpiresAt, sessionId]);
  const createTenant = async () => {
    if (!newTenantName.trim() || !newTenantSlug.trim()) return;
    try {
      const created = await platformPort.createTenant(
        newTenantName.trim(),
        newTenantSlug.trim(),
        newTenantPlan
      );
      const initialLimit =
        newTenantPlan === '企业版' ? '500,000' : newTenantPlan === '专业版' ? '200,000' : '100,000';
      setTenantRows((current) => [
        ...current,
        {
          id: created.id,
          name: newTenantName.trim(),
          slug: newTenantSlug.trim(),
          plan: newTenantPlan,
          users: 1,
          waybill: `0 / ${initialLimit}`,
          api: '0 / 5M',
          expires: '2027-07-22',
          days: 365,
          health: '健康',
          status: 'ACTIVE',
          version: created.version,
        },
      ]);
      setCreateOpen(false);
      setNewTenantName('');
      setNewTenantSlug('');
      setNewTenantPlan('专业版');
      setToast('租户已创建，默认套餐、模块和数据边界已初始化。');
    } catch (error) {
      setToast(error instanceof Error ? error.message : '租户创建失败。');
    }
  };
  const go = (next: Page) => {
    if (!pageAvailable(next, Boolean(session))) return;
    setSessionOutcome(null);
    setPage(next);
  };
  const startSelectedImpersonation = async () => {
    if (impersonationPendingRef.current || !impersonate || !reason.trim()) return;
    impersonationPendingRef.current = true;
    setImpersonationBusy(true);
    const target = impersonate;
    const why = reason.trim();
    const fingerprint = JSON.stringify({ tenantId: target.id, reason: why, durationMinutes: 60 });
    if (impersonationIntentRef.current?.fingerprint !== fingerprint) {
      impersonationIntentRef.current = { fingerprint, idempotencyKey: interactionKey() };
    }
    const intent = impersonationIntentRef.current;
    let created: Awaited<ReturnType<typeof platformPort.startImpersonation>> | undefined;
    try {
      created = await platformPort.startImpersonation(target.id, why, intent.idempotencyKey);
      if (impersonationIntentRef.current === intent) impersonationIntentRef.current = undefined;
      const checked = await platformPort.checkImpersonation(created.id, 0);
      if (checked.status !== 'ACTIVE') {
        await platformPort.endImpersonation().catch(() => undefined);
        setSessionEvidence({
          permissionsVersion: checked.permissionsVersion,
          eventId: checked.eventId,
        });
        setSessionOutcome(checked.status === 'REVOKED' ? 'revoked' : 'expired');
        setImpersonate(null);
        return;
      }
      setAuditReason(why);
      setRemainingSeconds(60 * 60);
      setSession({
        id: created.id,
        permissionsVersion: checked.permissionsVersion,
        tenant: target,
        reason: why,
        expiresAt: new Date(created.expiresAt).getTime(),
      });
      setImpersonate(null);
    } catch (error) {
      if (created) await platformPort.endImpersonation().catch(() => undefined);
      if (!(error instanceof TypeError) && impersonationIntentRef.current === intent) {
        impersonationIntentRef.current = undefined;
      }
      setToast(error instanceof Error ? error.message : '代入会话创建失败');
    } finally {
      impersonationPendingRef.current = false;
      setImpersonationBusy(false);
    }
  };
  const navigateFromSearch = (result: SearchResult) => {
    if (!pageAvailable(result.page, Boolean(session))) return;
    go(result.page);
    if (result.tenantId) {
      const tenant = tenantRows.find((item) => item.id === result.tenantId);
      if (tenant) setDetail(tenant);
    }
  };
  let content: ReactNode;
  if (page === '租户管理')
    content = (
      <TenantsPage
        tenants={filtered}
        search={search}
        setSearch={setSearch}
        onCreate={() => setCreateOpen(true)}
        onDetail={setDetail}
        onImpersonate={(tenant) => {
          impersonationIntentRef.current = undefined;
          setReason('协助排查订单同步问题');
          setImpersonate(tenant);
        }}
      />
    );
  else if (page === '套餐与模块')
    content = (
      <ModulesPage
        tenant={tenantRows[0]!}
        updateTenantVersion={(version) =>
          setTenantRows((rows) =>
            rows.map((tenant, index) => (index === 0 ? { ...tenant, version } : tenant))
          )
        }
        notify={setToast}
      />
    );
  else if (page === '配额与用量')
    content = (
      <UsagePage
        key={selectedTenantId}
        tenants={tenantRows}
        selectedTenantId={selectedTenantId}
        selectTenant={setSelectedTenantId}
        notify={setToast}
        save={async (tenantId, currentVersion, config) => {
          const version = await platformPort.saveTenantConfiguration(tenantId, currentVersion, {
            plan: config.plan,
            waybillLimit: config.limit,
            expires: config.expires,
          });
          const update = (tenant: Tenant): Tenant => {
            if (tenant.id !== tenantId) return tenant;
            const used = tenant.waybill.split('/')[0]?.trim() ?? '0';
            const days = Math.max(
              0,
              Math.ceil(
                (new Date(`${config.expires}T00:00:00+08:00`).getTime() -
                  new Date('2026-07-22T00:00:00+08:00').getTime()) /
                  86_400_000
              )
            );
            return {
              ...tenant,
              plan: config.plan,
              waybill: `${used} / ${config.limit.toLocaleString('en-US')}`,
              expires: config.expires,
              days,
              version,
            };
          };
          setTenantRows((rows) => rows.map(update));
          setDetail((current) => (current ? update(current) : null));
          return version;
        }}
      />
    );
  else if (page === '平台公告')
    content = (
      <AnnouncementsPage
        announcements={announcements}
        addAnnouncement={(announcement) =>
          setAnnouncements((current) => [announcement, ...current])
        }
        notify={setToast}
      />
    );
  else if (page === '代入与审计') content = <AuditPage records={auditRecords} />;
  else if (operationPages.includes(page as OperationsPageName))
    content = (
      <OperationsPage
        key={page}
        page={page as OperationsPageName}
        onExecute={platformPort.executeOperation}
      />
    );
  else content = <RuntimePage readOnly={Boolean(session)} />;

  return (
    <div className="platform-shell">
      <aside className="platform-sidebar">
        <div className="platform-brand">
          <span>智</span>智立科技物流AI系统
        </div>
        <button
          className="platform-mobile-nav-trigger"
          type="button"
          aria-label={mobileNavOpen ? '关闭平台导航' : '打开平台导航'}
          aria-expanded={mobileNavOpen}
          aria-haspopup="dialog"
          onClick={() => setMobileNavOpen(true)}
        >
          <span aria-hidden="true">☰</span>
        </button>
        <nav aria-label="平台导航">
          <h2>平台运营</h2>
          {pages.slice(0, 3).map((item) => (
            <button
              key={item}
              disabled={Boolean(session)}
              data-active={page === item || undefined}
              onClick={() => go(item)}
            >
              {item}
            </button>
          ))}
          <h2>治理</h2>
          {pages.slice(3).map((item) => (
            <button
              key={item}
              disabled={Boolean(session) && item !== '代入与审计' && item !== '运行中心'}
              data-active={page === item || undefined}
              onClick={() => go(item)}
            >
              {item}
            </button>
          ))}
          <h2>系统运维</h2>
          {operationPages.map((item) => (
            <button
              key={item}
              disabled={Boolean(session)}
              data-active={page === item || undefined}
              onClick={() => go(item)}
            >
              {item}
            </button>
          ))}
        </nav>
        <div className="platform-profile">
          <span>张</span>
          <div>
            <strong>张伟</strong>
            <small>系统管理员</small>
          </div>
        </div>
      </aside>
      <div className="platform-content">
        <header>
          <span>
            平台总览 / <strong>{page}</strong>
          </span>
          <GlobalSearch
            value={globalSearch}
            results={globalSearchResults}
            onChange={setGlobalSearch}
            onSelect={navigateFromSearch}
          />
          <span>
            ？ ♧ <b>张</b>
          </span>
        </header>
        {session ? (
          <div className="platform-session" role="status">
            <strong>正在代入：{session.tenant.name}</strong>
            <span>
              张伟（系统管理员） · 原因：{session.reason} · 剩余{' '}
              {String(Math.floor(remainingSeconds / 60)).padStart(2, '0')}:
              {String(remainingSeconds % 60).padStart(2, '0')} · 所有操作都会审计
            </span>
            <button
              onClick={() =>
                void platformPort
                  .endImpersonation()
                  .then(() => {
                    setSession(null);
                    setSessionOutcome('ended');
                  })
                  .catch((error: Error) => setToast(error.message))
              }
            >
              立即退出
            </button>
            {mockMode ? (
              <>
                <button
                  onClick={() =>
                    void platformPort
                      .revokeMockImpersonation(session.id)
                      .then(() =>
                        platformPort.checkImpersonation(session.id, session.permissionsVersion)
                      )
                      .then((status) => {
                        if (status.status !== 'REVOKED') return;
                        setSessionEvidence({
                          permissionsVersion: status.permissionsVersion,
                          eventId: status.eventId,
                        });
                        setSession(null);
                        setSessionOutcome('revoked');
                        setPage('租户管理');
                      })
                      .catch((error: Error) => setToast(error.message))
                  }
                >
                  模拟权限撤回
                </button>
                <button
                  onClick={() => {
                    setSession(null);
                    setSessionOutcome('expired');
                    setPage('租户管理');
                  }}
                >
                  模拟会话过期
                </button>
              </>
            ) : null}
          </div>
        ) : null}
        <main>
          {sessionOutcome ? (
            <SessionOutcome
              kind={sessionOutcome}
              permissionsVersion={sessionEvidence.permissionsVersion}
              eventId={sessionEvidence.eventId}
              onRecover={() => {
                setSessionOutcome(null);
                setPage('租户管理');
              }}
            />
          ) : session && page !== '代入与审计' && page !== '运行中心' ? (
            <section className="platform-panel" aria-label="代入租户上下文">
              <h1>{session.tenant.name} · 租户管理员视图</h1>
              <p>平台套餐、模块、配额、公告与租户生命周期写操作已隔离。</p>
              <p>可前往“代入与审计”查看记录，或立即退出返回平台上下文。</p>
            </section>
          ) : (
            content
          )}
        </main>
      </div>
      {toast ? (
        <div className="platform-toast" role="status">
          {toast}
          <button aria-label="关闭提示" onClick={() => setToast('')}>
            ×
          </button>
        </div>
      ) : null}
      <Drawer open={mobileNavOpen} title="平台导航菜单" onOpenChange={setMobileNavOpen}>
        <nav className="platform-mobile-navigation" aria-label="紧凑平台导航">
          {pages.map((item) => (
            <button
              key={item}
              type="button"
              disabled={!pageAvailable(item, Boolean(session))}
              aria-current={page === item ? 'page' : undefined}
              data-active={page === item || undefined}
              onClick={() => {
                go(item);
                setMobileNavOpen(false);
              }}
            >
              {item}
            </button>
          ))}
        </nav>
      </Drawer>
      <Drawer
        open={Boolean(detail)}
        title="租户详情"
        onOpenChange={(open) => !open && setDetail(null)}
      >
        {detail ? (
          <TenantDetail
            tenant={detail}
            onConfigure={() => {
              setAccessCatalogs((current) =>
                current[detail.id]
                  ? current
                  : { ...current, [detail.id]: createAccessPolicyCatalog() }
              );
              setWorkflowTenant(detail);
              setDetail(null);
            }}
            changeStatus={(status) =>
              void platformPort
                .changeTenantStatus(detail, status)
                .then((updated) => {
                  const next = { ...detail, status: updated.status, version: updated.version };
                  setDetail(next);
                  setTenantRows((rows) => rows.map((row) => (row.id === next.id ? next : row)));
                  setToast(status === 'ACTIVE' ? '租户已恢复。' : '租户已停用。');
                })
                .catch((error: Error) => setToast(error.message))
            }
          />
        ) : null}
      </Drawer>
      {workflowTenant ? (
        <AccessWorkflow
          tenant={workflowTenant}
          port={platformPort}
          mockMode={mockMode}
          catalog={accessCatalogs[workflowTenant.id] ?? createAccessPolicyCatalog()}
          onBaselineReloaded={(baseline: AccessPolicyBaselineRefresh) => {
            setTenantRows((rows) =>
              rows.map((tenant) =>
                tenant.id === baseline.tenantId
                  ? { ...tenant, version: baseline.tenantVersion }
                  : tenant
              )
            );
            setAccessCatalogs((current) => {
              const catalog = current[baseline.tenantId] ?? createAccessPolicyCatalog();
              return {
                ...current,
                [baseline.tenantId]: {
                  subjects: baseline.subjects,
                  roles: catalog.roles.map((role) =>
                    role.id === baseline.role.id ? baseline.role : role
                  ),
                },
              };
            });
          }}
          onClose={() => {
            const tenantName = workflowTenant.name;
            accessSaveProgress.current = undefined;
            setWorkflowTenant(null);
            queueMicrotask(() =>
              document
                .querySelector<HTMLButtonElement>(
                  `[aria-label="查看租户 ${tenantName.replaceAll('"', '\\"')}"]`
                )
                ?.focus()
            );
          }}
          onSave={async (draft: AccessPolicyDraft) => {
            const progressKey = JSON.stringify(draft);
            const progress =
              accessSaveProgress.current?.key === progressKey
                ? accessSaveProgress.current
                : {
                    key: progressKey,
                    roleKey: interactionKey(),
                    tenantKey: interactionKey(),
                  };
            accessSaveProgress.current = progress;
            progress.role ??= await platformPort.updateRolePolicy(
              draft.role.id,
              draft.role.version,
              { statements: draft.statements, reason: draft.reason },
              progress.roleKey
            );
            progress.tenantVersion ??= await platformPort.saveEntitlements(
              draft.tenant.id,
              draft.tenant.version,
              { modules: draft.modules },
              progress.tenantKey
            );
            if (!progress.role || progress.tenantVersion === undefined)
              throw new Error('ACCESS_POLICY_SAVE_RECEIPT_INCOMPLETE');
            const role = progress.role;
            const version = progress.tenantVersion;
            setTenantRows((rows) =>
              rows.map((tenant) =>
                tenant.id === draft.tenant.id ? { ...tenant, version } : tenant
              )
            );
            setAccessCatalogs((current) => {
              const catalog = current[draft.tenant.id] ?? createAccessPolicyCatalog();
              return {
                ...current,
                [draft.tenant.id]: {
                  ...catalog,
                  roles: catalog.roles.map((item) =>
                    item.id === role.roleId
                      ? {
                          ...item,
                          version: role.version,
                          statements: role.statements.map((statement) => ({
                            ...statement,
                            actions: [...statement.actions],
                          })),
                        }
                      : item
                  ),
                },
              };
            });
            accessSaveProgress.current = undefined;
            return {
              tenantId: draft.tenant.id,
              tenantVersion: version,
              roleId: role.roleId,
              roleVersion: role.version,
              subjectId: draft.subject.id,
              effectiveModuleCount: draft.modules.filter((item) => item.enabled).length,
              savedAt: new Date().toISOString(),
            };
          }}
        />
      ) : null}
      <Dialog
        open={createOpen}
        title="新建租户"
        description="创建独立租户边界，并初始化套餐、模块和配额。"
        onOpenChange={setCreateOpen}
        footer={
          <>
            <Button variant="secondary" onClick={() => setCreateOpen(false)}>
              取消
            </Button>
            <Button
              disabled={!newTenantName.trim() || !newTenantSlug.trim()}
              onClick={() => void createTenant()}
            >
              确认创建租户
            </Button>
          </>
        }
      >
        <div className="platform-create-form">
          <label>
            租户名称
            <input
              aria-label="租户名称"
              value={newTenantName}
              onChange={(event) => setNewTenantName(event.target.value)}
            />
          </label>
          <label>
            租户 SLUG
            <input
              aria-label="租户 SLUG"
              value={newTenantSlug}
              onChange={(event) => setNewTenantSlug(event.target.value)}
            />
          </label>
          <label>
            默认套餐
            <select
              aria-label="默认套餐"
              value={newTenantPlan}
              onChange={(event) => setNewTenantPlan(event.target.value)}
            >
              <option>基础版</option>
              <option>专业版</option>
              <option>企业版</option>
            </select>
          </label>
        </div>
      </Dialog>
      <Dialog
        open={Boolean(impersonate)}
        title="代入租户"
        description={`将进入 ${impersonate?.name ?? ''}。所有操作都会审计，默认限时 60 分钟。`}
        onOpenChange={(open) => {
          if (!open && !impersonationBusy) {
            impersonationIntentRef.current = undefined;
            setImpersonate(null);
          }
        }}
        footer={
          <>
            <Button
              variant="secondary"
              disabled={impersonationBusy}
              onClick={() => {
                impersonationIntentRef.current = undefined;
                setImpersonate(null);
              }}
            >
              取消
            </Button>
            <Button
              loading={impersonationBusy}
              disabled={!reason.trim() || impersonationBusy}
              onClick={() => void startSelectedImpersonation()}
            >
              以管理员身份进入
            </Button>
          </>
        }
      >
        <label className="platform-reason">
          代入原因
          <textarea
            aria-label="代入原因"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            maxLength={200}
          />
        </label>
        <p className="platform-warning">代入动作会按审计记录，禁止进行非授权操作。</p>
      </Dialog>
    </div>
  );
}
