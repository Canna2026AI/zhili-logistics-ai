# F1C 客户门户、平台端与官网交付证据

## 交付范围

- 客户门户：工作台、查价、新建运单、运单列表、轨迹、账单付款、预存款、未分配收款、付款凭证、工单与 API 申请。
- 平台端：租户创建与详情、套餐、模块、配额、到期日、公告、代入原因与倒计时、审计记录、运行中心。
- 官网：深色品牌首屏、产品实景预览、能力与安全模块、登录、预约演示、法律页、`robots.txt`、`sitemap.xml` 与 canonical SEO。
- Storybook：`Portals/F1C` 下的客户门户、平台端与官网全屏故事。

## 功能与交互验证

- 客户事实使用 `S2505120004`、`123.50 kg`、`0.48 m³`、账单 `CNY 5,320.00`、已付 `CNY 3,000.00`、待付 `CNY 2,320.00`、预存款 `CNY 128,560.00`、未分配收款 `CNY 1,200.00`。
- 客户数据边界仅显示“深圳鑫源贸易有限公司”；测试明确断言不会泄漏其他租户名称。
- 查价结果可带入新建运单；提交后运单进入当前租户列表并可查询轨迹。
- 付款操作包含危险确认，确认后生成付款记录；工单、API 申请和异常状态均有用户反馈。
- 平台租户可真实创建并进入列表；租户详情展示套餐、模块、配额和到期日。
- 平台代入必须填写原因，成功后显示倒计时并写入审计；模块、公告和运行状态可交互。
- 官网登录、微信入口、预约演示、首页锚点和三类法律页均有真实路由或状态反馈，无伪可点击控件。
- 所有业务写操作经过基于 `@zhili/api-client` 源码的强类型端口及本地可控 mock transport；只有服务成功才落 UI/持久化状态，失败会保留输入并展示可重试错误。
- 客户新运单、支付记录、地址、凭证和快捷入口，以及平台租户、授权和代入会话使用租户范围的本地持久化模拟服务端状态，可验证刷新恢复。

## 状态覆盖

三端覆盖正常、加载、空、失败、无权限、陈旧、部分成功；付款/代入覆盖危险确认。非正常态不再混显正常数据或开放危险动作，陈旧态提供刷新比较，部分成功只允许重试失败项。状态入口通过“演示状态”选择器或对应业务动作可复现。

## 独立评审闭环

- I-01：客户、平台和官网写命令全部接入强类型 API port；新增服务失败保留输入测试。
- I-02：`S2505120006` 在提交成功后真实加入列表并显示自己的轨迹；支付记录在确认前不存在，成功后才创建。
- I-03：补齐草稿、批量导入、地址簿、付款凭证、快捷入口持久化编辑、运单查询与异步导出。
- I-04：异常态替换正常数据区，危险动作不可执行；平台运行中心只在部分态展示失败项。
- I-05：代入会话包含操作者、原因、真实 `MM:SS` 倒计时和自动过期；代入时平台写入口被隔离，运行重试禁用。
- I-06：客户门户 390×844 实测 `scrollWidth <= clientWidth`，宽表滚动被限制在表格容器。
- I-07：官网构建产生 `privacy/terms/license/index.html`；四个静态 URL 实测 HTTP 200，HTML 内含标题、description、canonical、JSON-LD，资源使用 `/zhili-logistics-ai/` base。
- I-08：`Q2505120042` 恢复 canonical 分项：4,680.00 + 514.80 + 80.00 + 45.20 = 5,320.00。
- I-09：租户停用/恢复、套餐草稿、模块授权、配额、套餐和到期日形成保存版本闭环。

## TDD 与自动化结果

实现按红—绿—重构推进：先为客户核心链路、平台租户创建/代入、官网法律与 SEO 编写失败测试，再补实现并通过回归。

- 单元测试：客户门户 10/10、平台端 8/8、官网 6/6，总计 24/24。
- Playwright：客户 3（含 390px）、平台 1、官网桌面 1、官网移动 1、axe 1，总计 7/7。
- axe：五端首屏 `serious` / `critical` 违规为 0。
- 三端 `lint`、`typecheck`、`build`：全部通过。
- Storybook `lint`、`typecheck`、`build`：全部通过；仅有非阻断的大分块提示。

关键复现命令：

```bash
pnpm --filter @zhili/customer-portal test
pnpm --filter @zhili/platform test
pnpm --filter @zhili/website test
pnpm exec playwright test --project=customer --project=platform --project=website --project=website-mobile --project=a11y
```

## 视觉比对

对照源：

- `docs/01-design/concepts/04-customer-dashboard.png`
- `docs/01-design/concepts/05-platform-console.png`
- `docs/01-design/concepts/07-marketing-home.png`

实测截图：

- `artifacts/e2e/f1c/customer-dashboard-1440x900.png`
- `artifacts/e2e/f1c/customer-390x844.png`
- `artifacts/e2e/f1c/platform-tenants-1440x900.png`
- `artifacts/e2e/f1c/platform-tenants-detail-1440x900.png`
- `artifacts/e2e/f1c/website-1440x900.png`
- `artifacts/e2e/f1c/website-390x844.png`
- `artifacts/e2e/f1c/website-legal-1440x900.png`

五点人工比对：

1. 构图：三端均复现左侧导航、顶部工具区、主内容/右侧信息区或深色 Hero 的核心层级。
2. 色彩：业务端使用石墨侧栏、白/浅灰内容面与青绿色主操作；官网 Hero 为 `#1f2937`，与概念方向一致。
3. 密度：客户工作台统计、最近运单和资金卡片同屏；平台表格与详情抽屉同屏；官网产品预览保留高密度业务事实。
4. 字体与控件：使用统一设计系统按钮、状态标签、对话框和紧凑表格，保持中文企业软件的层级与可读性。
5. 响应式：桌面 1440×900 与移动 390×844 均实测；客户门户与官网均无页面级横向溢出，宽表仅在自身容器滚动，CTA 保持可见。

概念中的虚构品牌和静态按钮已替换为“智立科技物流AI系统”的真实业务状态与可执行交互；未发现影响验收的重大视觉偏差。当前环境未提供可用的应用内浏览器控制入口，因此浏览器验证使用仓库 Playwright Chromium 配置完成并留存截图。
