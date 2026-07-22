import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Button, Dialog, Drawer, StatusTag } from '@zhili/ui';
import { platformPort } from './api';

type Page = '租户管理' | '套餐与模块' | '配额与用量' | '平台公告' | '代入与审计' | '运行中心';
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
  tenant: Tenant;
  reason: string;
  expiresAt: number;
};

const tenantSeed: Tenant[] = [
  {
    id: '1',
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
    id: '2',
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
    id: '3',
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
    id: '4',
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
    id: '5',
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
    return session.expiresAt > Date.now() ? session : null;
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
}: {
  tenant: Tenant;
  changeStatus: (status: 'ACTIVE' | 'SUSPENDED') => void;
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

function ModulesPage({ notify }: { notify: (text: string) => void }) {
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
                    .saveEntitlements('1', { plan, module, enabled: next })
                    .then(() => {
                      setEnabled((current) => {
                        const updated = { ...current, [module]: next };
                        localStorage.setItem('zhili.platform.modules', JSON.stringify(updated));
                        return updated;
                      });
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
            void save(tenant.id, { plan, limit: Number(limit), expires })
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

function AnnouncementsPage({ notify }: { notify: (text: string) => void }) {
  const [title, setTitle] = useState('');
  const [announcements, setAnnouncements] = useState<string[]>(() => {
    try {
      return JSON.parse(
        localStorage.getItem('zhili.platform.announcements') ?? '["2026 年 5 月例行维护通知"]'
      ) as string[];
    } catch {
      return ['2026 年 5 月例行维护通知'];
    }
  });
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
                setAnnouncements((items) => {
                  const updated = [next, ...items];
                  localStorage.setItem('zhili.platform.announcements', JSON.stringify(updated));
                  return updated;
                });
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

function AuditPage({ auditReason }: { auditReason: string }) {
  return (
    <>
      <Header title="代入与审计" description="代入时长、原因、操作对象和退出时间完整留痕。" />
      <div className="platform-table-wrap">
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
            <tr>
              <td>2026-05-12 10:21</td>
              <td>张伟（admin）</td>
              <td>上海智立科技有限公司</td>
              <td>以管理员身份代入（60 分钟）</td>
              <td>{auditReason || '协助排查订单同步问题'}</td>
              <td>
                <StatusTag tone="success">已审计</StatusTag>
              </td>
            </tr>
            <tr>
              <td>2026-05-10 15:42</td>
              <td>系统</td>
              <td>广州港捷供应链管理</td>
              <td>授权变更</td>
              <td>开启模块「自动化」</td>
              <td>
                <StatusTag tone="success">完成</StatusTag>
              </td>
            </tr>
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
  const [state, setState] = useState<RuntimeState>('normal');
  const [message, setMessage] = useState('');
  const [differences, setDifferences] = useState<
    Array<{ field: string; local: string; server: string }>
  >([]);
  const [recovering, setRecovering] = useState(false);
  const selectState = (next: RuntimeState) => {
    setState(next);
    setMessage('');
    setDifferences([]);
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
        const result = await platformPort.retryRuntimeJobs(['job-pay-382', 'job-pay-384']);
        setState('normal');
        setMessage(`${result.items.map((item) => item.id).join('、')} 已合并为成功。`);
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
              ['失败作业', '2 / 384', '需处理'],
            ].map(([label, value, status]) => (
              <div key={label}>
                <span>{label}</span>
                <strong>{value}</strong>
                <small>{status}</small>
              </div>
            ))}
          </section>
          <div className="platform-table-wrap">
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
                  <td>支付回调</td>
                  <td>2026-05-12 10:21</td>
                  <td>382</td>
                  <td>2</td>
                  <td>480ms</td>
                  <td>
                    <StatusTag tone="warning">部分失败：2 / 384</StatusTag>
                  </td>
                </tr>
                {state === 'normal' ? (
                  <>
                    <tr>
                      <td>UPS 轨迹同步</td>
                      <td>2026-05-12 10:20</td>
                      <td>1,248</td>
                      <td>0</td>
                      <td>1.2s</td>
                      <td>
                        <StatusTag tone="success">健康</StatusTag>
                      </td>
                    </tr>
                    <tr>
                      <td>DHL 下单</td>
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
  const [detail, setDetail] = useState<Tenant | null>(null);
  const [impersonate, setImpersonate] = useState<Tenant | null>(null);
  const [reason, setReason] = useState('协助排查订单同步问题');
  const [auditReason, setAuditReason] = useState('');
  const [toast, setToast] = useState('');
  const [session, setSession] = useState<Impersonation | null>(readSession);
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);
  const [newTenantName, setNewTenantName] = useState('');
  const [newTenantSlug, setNewTenantSlug] = useState('');
  const [newTenantPlan, setNewTenantPlan] = useState('专业版');
  const [selectedTenantId, setSelectedTenantId] = useState('1');
  useEffect(
    () => localStorage.setItem('zhili.platform.tenants', JSON.stringify(tenantRows)),
    [tenantRows]
  );
  useEffect(() => {
    if (session) localStorage.setItem('zhili.platform.impersonation', JSON.stringify(session));
    else localStorage.removeItem('zhili.platform.impersonation');
  }, [session]);
  const filtered = useMemo(
    () =>
      tenantRows.filter((tenant) =>
        `${tenant.name}${tenant.slug}`.toLowerCase().includes(search.toLowerCase())
      ),
    [search, tenantRows]
  );
  useEffect(() => {
    if (!session) return;
    const update = () => {
      const remaining = Math.max(0, Math.ceil((session.expiresAt - Date.now()) / 1000));
      setRemainingSeconds(remaining);
      if (remaining === 0) {
        setSession(null);
        setToast('代入会话已过期，已安全返回平台上下文；未提交草稿已保留。');
      }
    };
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [session]);
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
  const go = (next: Page) => setPage(next);
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
          setReason('协助排查订单同步问题');
          setImpersonate(tenant);
        }}
      />
    );
  else if (page === '套餐与模块') content = <ModulesPage notify={setToast} />;
  else if (page === '配额与用量')
    content = (
      <UsagePage
        key={selectedTenantId}
        tenants={tenantRows}
        selectedTenantId={selectedTenantId}
        selectTenant={setSelectedTenantId}
        notify={setToast}
        save={async (tenantId, config) => {
          const version = await platformPort.saveTenantConfiguration(tenantId, {
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
  else if (page === '平台公告') content = <AnnouncementsPage notify={setToast} />;
  else if (page === '代入与审计') content = <AuditPage auditReason={auditReason} />;
  else content = <RuntimePage readOnly={Boolean(session)} />;

  return (
    <div className="platform-shell">
      <aside className="platform-sidebar">
        <div className="platform-brand">
          <span>智</span>智立科技物流AI系统
        </div>
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
          <input aria-label="平台全局搜索" placeholder="搜索租户、作业或审计记录" />
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
                  .then(() => setSession(null))
                  .catch((error: Error) => setToast(error.message))
              }
            >
              立即退出
            </button>
          </div>
        ) : null}
        <main>
          {session && page !== '代入与审计' && page !== '运行中心' ? (
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
      <Drawer
        open={Boolean(detail)}
        title="租户详情"
        onOpenChange={(open) => !open && setDetail(null)}
      >
        {detail ? (
          <TenantDetail
            tenant={detail}
            changeStatus={(status) =>
              void platformPort
                .changeTenantStatus(detail.id, status)
                .then(() => {
                  const next = { ...detail, status, version: detail.version + 1 };
                  setDetail(next);
                  setTenantRows((rows) => rows.map((row) => (row.id === next.id ? next : row)));
                  setToast(status === 'ACTIVE' ? '租户已恢复。' : '租户已停用。');
                })
                .catch((error: Error) => setToast(error.message))
            }
          />
        ) : null}
      </Drawer>
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
        onOpenChange={(open) => !open && setImpersonate(null)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setImpersonate(null)}>
              取消
            </Button>
            <Button
              disabled={!reason.trim()}
              onClick={() => {
                if (!impersonate || !reason.trim()) return;
                const target = impersonate;
                const why = reason.trim();
                void platformPort
                  .startImpersonation(target.id, why)
                  .then((created) => {
                    setAuditReason(why);
                    setRemainingSeconds(60 * 60);
                    setSession({
                      tenant: target,
                      reason: why,
                      expiresAt: new Date(created.expiresAt).getTime(),
                    });
                    setImpersonate(null);
                  })
                  .catch((error: Error) => setToast(error.message));
              }}
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
