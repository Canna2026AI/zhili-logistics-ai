import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import {
  Bot,
  Boxes,
  Building2,
  CircleDollarSign,
  ClipboardList,
  FileCheck2,
  LockKeyhole,
  Route,
  ScanLine,
  ShieldCheck,
  Truck,
  UserRound,
} from 'lucide-react';
import { Button, Dialog, StatusTag } from '@zhili/ui';

type LegalPage = 'privacy' | 'terms' | 'license';

const legalContent: Record<
  LegalPage,
  { title: string; lead: string; sections: Array<[string, string]> }
> = {
  privacy: {
    title: '隐私政策',
    lead: '本政策说明智立科技如何处理企业账号、物流业务与安全审计数据。',
    sections: [
      ['我们处理的数据', '包括账号、企业配置、运单业务、操作日志与经授权的连接器数据。'],
      ['使用目的', '用于提供物流协作、权限隔离、故障排查、安全审计与客户支持。'],
      ['保留与删除', '按照合同、法定义务与租户配置保留；到期后执行可验证删除。'],
    ],
  },
  terms: {
    title: '服务条款',
    lead: '使用智立科技物流AI系统前，请确认企业授权范围与服务责任。',
    sections: [
      ['账户责任', '企业管理员负责用户授权、数据范围与合法使用。'],
      ['服务可用性', '维护窗口、故障与恢复目标按正式服务协议执行。'],
      ['禁止用途', '不得绕过权限、侵害第三方权益或用于违法业务。'],
    ],
  },
  license: {
    title: '开源许可',
    lead: '本项目公共代码以 AGPL-3.0-only 许可发布。',
    sections: [
      ['源代码', '部署、修改与网络交互的许可义务以仓库 LICENSE 为准。'],
      ['第三方组件', '第三方组件分别遵循其原始许可证。'],
      ['商业支持', '企业部署、迁移与运维服务不改变开源许可文本。'],
    ],
  },
};

function Brand() {
  return (
    <a
      className="site-logo"
      href="/"
      onClick={(event) => {
        event.preventDefault();
        window.history.pushState({}, '', '/');
        window.dispatchEvent(new PopStateEvent('popstate'));
      }}
    >
      <span aria-hidden="true">智</span>智立科技物流AI系统
    </a>
  );
}

function SiteHeader({ login }: { login: () => void }) {
  return (
    <header className="site-header">
      <Brand />
      <nav aria-label="官网导航">
        <a href="#product">产品能力</a>
        <a href="#solutions">解决方案</a>
        <a href="#security">安全与部署</a>
        <a href="https://github.com/Canna2026AI/zhili-logistics-ai">开源</a>
      </nav>
      <Button onClick={login}>登录</Button>
    </header>
  );
}

function ProductPreview() {
  const rows = [
    ['S2505120001', 'HBL2505120001', '转运中', '海运整箱', '美国/洛杉矶', '20', '12,340.50'],
    ['S2505120002', 'HBL2505120002', '待收货', '空运', '德国/法兰克福', '5', '320.00'],
    ['S2505120003', 'HBL2505120003', '待分拣', '海运拼箱', '美国/伦敦', '8', '1,250.30'],
    ['S2505120004', 'HBL2505120004', '已签收', '海运整箱', '澳大利亚/悉尼', '18', '123.50 kg'],
    ['S2505120005', 'HBL2505120005', '待称重', '铁路', '俄罗斯/莫斯科', '12', '6,500.00'],
  ];
  return (
    <div className="site-preview" aria-label="智立系统产品预览">
      <div className="site-preview-top">
        <strong>智立科技（深圳）有限公司</strong>
        <input aria-label="产品预览搜索" value="S2505120004" readOnly />
      </div>
      <aside>
        {[
          '运营工作台',
          '主数据',
          '渠道报价',
          '订单运单',
          '仓库',
          '订舱/提单',
          '尾程',
          '轨迹客服',
          '财务',
          '报表',
          '自动化集成',
          '系统',
        ].map((item) => (
          <span key={item} data-active={item === '订单运单' || undefined}>
            {item}
          </span>
        ))}
      </aside>
      <section>
        <nav>
          {[
            '工作台',
            '运单管理',
            '仓库扫描',
            '订单管理',
            '轨迹与回单',
            '应收应付',
            '客户门户',
            '自动化',
          ].map((item) => (
            <span key={item} data-active={item === '运单管理' || undefined}>
              {item}
            </span>
          ))}
        </nav>
        <div className="site-preview-counts">
          <b>全部运单 1,248</b>
          <span>待收货 86</span>
          <span>运输中 238</span>
          <span>已签收 1,123</span>
          <span>问题件 46</span>
        </div>
        <div className="site-preview-toolbar">
          <button disabled>＋ 新增</button>
          <button disabled>批量操作</button>
          <button disabled>高级筛选</button>
          <button disabled>保存视图</button>
        </div>
        <table>
          <thead>
            <tr>
              <th>运单号</th>
              <th>主运单号</th>
              <th>状态</th>
              <th>运输方式</th>
              <th>目的地</th>
              <th>件数</th>
              <th>重量(kg)</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row[0]}>
                <td>{row[0]}</td>
                <td>{row[1]}</td>
                <td>
                  <StatusTag
                    tone={
                      row[2].includes('签') ? 'success' : row[2].includes('待') ? 'warning' : 'info'
                    }
                  >
                    {row[2]}
                  </StatusTag>
                </td>
                {row.slice(3).map((cell) => (
                  <td key={cell}>{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <div className="site-preview-drawer">
        <div>
          <strong>运单详情</strong>
          <span>×</span>
        </div>
        <h3>
          S2505120004 <StatusTag tone="success">已签收</StatusTag>
        </h3>
        <p>主运单号：HBL2505120004</p>
        <nav>
          <b>概览</b>
          <span>轨迹</span>
          <span>货物</span>
          <span>费用</span>
        </nav>
        <dl>
          <div>
            <dt>运输方式</dt>
            <dd>海运整箱</dd>
          </div>
          <div>
            <dt>提单号</dt>
            <dd>COSU1234567890</dd>
          </div>
          <div>
            <dt>起运港</dt>
            <dd>上海港</dd>
          </div>
          <div>
            <dt>POD</dt>
            <dd>悉尼港内</dd>
          </div>
          <div>
            <dt>件数/重量</dt>
            <dd>18 / 123.50 kg</dd>
          </div>
          <div>
            <dt>体积</dt>
            <dd>0.48 m³</dd>
          </div>
        </dl>
      </div>
    </div>
  );
}

function Capability({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return (
    <article>
      {icon}
      <div>
        <h3>{title}</h3>
        <p>{text}</p>
      </div>
      <span aria-hidden="true">›</span>
    </article>
  );
}

function LegalView({
  page,
  goHome,
  login,
  navigate,
}: {
  page: LegalPage;
  goHome: () => void;
  login: () => void;
  navigate: (page: LegalPage) => void;
}) {
  const item = legalContent[page];
  return (
    <div className="site">
      <SiteHeader login={login} />
      <main className="site-legal">
        <button onClick={goHome}>返回首页</button>
        <h1>{item.title}</h1>
        <p className="site-legal-lead">{item.lead}</p>
        <p>生效日期：2026 年 5 月 12 日</p>
        {item.sections.map(([title, body]) => (
          <section key={title}>
            <h2>{title}</h2>
            <p>{body}</p>
          </section>
        ))}
      </main>
      <SiteFooter navigate={navigate} />
    </div>
  );
}

function SiteFooter({ navigate }: { navigate: (page: LegalPage) => void }) {
  return (
    <footer className="site-footer">
      <div>
        <Brand />
        <small>让跨境物流业务、仓储与财务在一套系统中闭环</small>
      </div>
      <nav>
        <a
          href="/privacy"
          onClick={(event) => {
            event.preventDefault();
            navigate('privacy');
          }}
        >
          隐私政策
        </a>
        <a
          href="/terms"
          onClick={(event) => {
            event.preventDefault();
            navigate('terms');
          }}
        >
          服务条款
        </a>
        <a
          href="/license"
          onClick={(event) => {
            event.preventDefault();
            navigate('license');
          }}
        >
          开源许可
        </a>
      </nav>
      <div>
        <span>AGPL-3.0</span>
        <span>© 2026 智立科技</span>
        <span>保留所有权利。</span>
      </div>
    </footer>
  );
}

export function App() {
  const [path, setPath] = useState(window.location.pathname);
  const [loginOpen, setLoginOpen] = useState(false);
  const [demoOpen, setDemoOpen] = useState(false);
  const [toast, setToast] = useState('');
  useEffect(() => {
    const onPop = () => setPath(window.location.pathname);
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  const navigate = (page: LegalPage) => {
    window.history.pushState({}, '', `/${page}`);
    setPath(`/${page}`);
  };
  const currentLegal = path.slice(1) as LegalPage;
  useEffect(() => {
    const page = legalContent[currentLegal];
    document.title = page
      ? `${page.title}｜智立科技物流AI系统`
      : '智立科技物流AI系统｜跨境物流业务一体化平台';
    let meta = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'description';
      document.head.append(meta);
    }
    meta.content = page
      ? `${page.title}：智立科技物流AI系统公开法律信息。`
      : '智立科技物流AI系统连接订单、仓储、运输、轨迹、结算与 AI 自动化。';
    let canonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement('link');
      canonical.rel = 'canonical';
      document.head.append(canonical);
    }
    const suffix = page ? `/${currentLegal}` : '/';
    canonical.href = `https://canna2026ai.github.io/zhili-logistics-ai${suffix}`;
  }, [currentLegal]);
  if (legalContent[currentLegal])
    return (
      <LegalView
        page={currentLegal}
        login={() => {
          window.history.pushState({}, '', '/');
          setPath('/');
          setLoginOpen(true);
        }}
        navigate={navigate}
        goHome={() => {
          window.history.pushState({}, '', '/');
          setPath('/');
        }}
      />
    );
  const submitDemo = (event: FormEvent) => {
    event.preventDefault();
    setDemoOpen(false);
    setToast('预约已提交，方案顾问将在 1 个工作日内联系您。');
  };
  return (
    <div className="site">
      <SiteHeader login={() => setLoginOpen(true)} />
      <main>
        <section className="site-hero-dark" aria-label="智立物流 AI 产品介绍">
          <div className="site-hero-inner">
            <div className="site-hero-copy">
              <h1 aria-label="让跨境物流业务、仓储与财务在一套系统中闭环；把跨境物流的订单、仓配、轨迹与结算放进同一个工作系统">
                让跨境物流业务、
                <br />
                仓储与财务在一套系统中闭环
              </h1>
              <p>
                订单、仓储、运输、轨迹、应收应付与对账自动衔接，AI
                提升效率，数据驱动决策，助力全球物流企业降本增效。
              </p>
              <div>
                <Button size="large" onClick={() => setLoginOpen(true)}>
                  进入系统
                </Button>
                <Button
                  size="large"
                  variant="secondary"
                  onClick={() => document.querySelector('#product')?.scrollIntoView()}
                >
                  查看功能
                </Button>
              </div>
              <ul>
                <li>
                  <ShieldCheck />
                  全链路闭环
                </li>
                <li>
                  <Bot />
                  AI 智能驱动
                </li>
                <li>
                  <Route />
                  全球化运营
                </li>
                <li>
                  <LockKeyhole />
                  安全合规
                </li>
              </ul>
            </div>
            <ProductPreview />
          </div>
        </section>
        <section id="product" className="site-primary-capabilities">
          <Capability
            icon={<ClipboardList />}
            title="下单"
            text="多渠道提单，自动校验与分配，智能生成运单。"
          />
          <Capability
            icon={<FileCheck2 />}
            title="报价"
            text="智能报价，成本透明可控，快速响应客户需求。"
          />
          <Capability
            icon={<Building2 />}
            title="仓库"
            text="入库、分拣、打包、出库，库存实时可视。"
          />
          <Capability
            icon={<Truck />}
            title="运输"
            text="多式联运、全球运力整合，轨迹监控与异常预警。"
          />
          <Capability
            icon={<ScanLine />}
            title="尾程与签收（POD）"
            text="尾程派送跟踪、电子签收回单，签收状态实时回传。"
          />
          <Capability
            icon={<CircleDollarSign />}
            title="结算（对账与收款）"
            text="应收应付、开票与对账，客户账款闭环。"
          />
        </section>
        <section id="solutions" className="site-secondary-capabilities">
          <Capability
            icon={<Boxes />}
            title="运营管理"
            text="一体化运营视图，实时监控订单、仓储、运输与财务关键指标。"
          />
          <Capability
            icon={<UserRound />}
            title="客户门户"
            text="客户自助下单，查询运单单据、对账通知，服务体验更高效。"
          />
          <Capability
            icon={<ScanLine />}
            title="PDA 作业"
            text="移动端作业，扫码收发货、上架、拣货、盘点，提升仓内效率。"
          />
          <Capability
            icon={<Bot />}
            title="AI 自动化"
            text="智能分单、异常预警、费用识别与对账，让团队专注更高价值工作。"
          />
        </section>
        <section id="security" className="site-security">
          <div>
            <h2>安全可靠，自主可控</h2>
            <p>
              提供私有化部署、权限与审计、数据安全与合规能力，满足跨境物流企业的合规与安全要求。
            </p>
          </div>
          <div>
            {[
              [<Building2 />, '私有化部署', '本地化部署，内网运行，数据不出境。'],
              [<LockKeyhole />, '权限与审计', '细粒度权限，完整操作日志可追溯。'],
              [<ShieldCheck />, '数据安全', '传输与存储加密，定期备份与容灾。'],
              [<FileCheck2 />, '合规可控', '满足跨境与财务合规要求，支持审计与监管。'],
            ].map(([icon, title, text]) => (
              <article key={String(title)}>
                {icon}
                <div>
                  <h3>{title}</h3>
                  <p>{text}</p>
                </div>
              </article>
            ))}
          </div>
        </section>
        <section className="site-cta">
          <div>
            <h2>从现在开始，打造更高效的跨境物流运营体系</h2>
            <p>智立科技物流 AI 系统，助力企业实现数智化升级与全球增长。</p>
          </div>
          <div>
            <Button size="large" variant="secondary" onClick={() => setLoginOpen(true)}>
              进入系统
            </Button>
            <Button size="large" onClick={() => setDemoOpen(true)}>
              预约演示
            </Button>
          </div>
        </section>
      </main>
      <SiteFooter navigate={navigate} />
      {toast ? (
        <div className="site-toast" role="status">
          {toast}
          <button aria-label="关闭提示" onClick={() => setToast('')}>
            ×
          </button>
        </div>
      ) : null}
      <Dialog
        open={loginOpen}
        title="登录智立系统"
        description="选择登录入口；真实身份校验将在后端接入企业会话。"
        onOpenChange={setLoginOpen}
        footer={<Button onClick={() => setLoginOpen(false)}>密码登录</Button>}
      >
        <div className="site-login-options">
          <label>
            企业账号
            <input aria-label="企业账号" placeholder="手机号 / 邮箱" />
          </label>
          <label>
            密码
            <input type="password" aria-label="密码" />
          </label>
          <Button
            variant="secondary"
            onClick={() => setToast('微信扫码登录入口已打开，请使用企业微信完成授权。')}
          >
            微信扫码登录
          </Button>
          <button
            className="site-dialog-link"
            aria-label="关闭登录"
            onClick={() => setLoginOpen(false)}
          >
            暂不登录
          </button>
        </div>
      </Dialog>
      <Dialog
        open={demoOpen}
        title="预约产品演示"
        description="留下企业信息，我们将按您的业务场景安排演示。"
        onOpenChange={setDemoOpen}
      >
        <form className="site-demo-form" onSubmit={submitDemo}>
          <label>
            企业名称
            <input aria-label="企业名称" required />
          </label>
          <label>
            联系电话
            <input aria-label="联系电话" required />
          </label>
          <label>
            关注能力
            <select>
              <option>订单与仓储</option>
              <option>运输与 POD</option>
              <option>财务结算</option>
            </select>
          </label>
          <Button type="submit">提交预约</Button>
        </form>
      </Dialog>
    </div>
  );
}
