# F1C 客户门户、平台端与官网交付证据

## 交付范围

- 客户门户：工作台、查价、新建运单、运单列表、轨迹、账单付款、预存款、未分配收款、付款凭证、工单与 API 申请。
- 平台端：租户创建与详情、套餐、模块、配额、到期日、公告、代入原因与倒计时、审计记录、运行中心。
- 官网：深色品牌首屏、产品实景预览、能力与安全模块、登录、预约演示、法律页、`robots.txt`、`sitemap.xml` 与 canonical SEO。
- Storybook：`Portals/F1C` 下的客户门户、平台端与官网全屏故事。

## 功能与交互验证

- 客户事实使用 `S2505120004`、`123.50 kg`、`0.48 m³`、账单 `CNY 5,320.00`、已付 `CNY 3,000.00`、待付 `CNY 2,320.00`、预存款 `CNY 128,560.00`、未分配收款 `CNY 1,200.00`。
- 客户数据边界仅显示“深圳鑫源贸易有限公司”；测试明确断言不会泄漏其他租户名称。
- 查价表单把始发地、目的邮编、重量和体积提交给强类型报价端口，结果保留请求快照；报价可带入新建运单。
- 新建运单把用户实际填写的发货地、目的地、收件人、电话、品名、件数和重量提交到订单端口，成功后将同一数据持久化并进入当前租户列表和轨迹。
- 付款操作包含危险确认，确认后生成付款记录；工单、API 申请和异常状态均有用户反馈。
- 平台租户可真实创建并进入列表；租户详情展示套餐、模块、配额和到期日。
- 平台代入必须填写原因，成功后显示倒计时并写入审计；模块、公告和运行状态可交互。
- 官网登录、微信入口、预约演示、首页锚点和三类法律页均有真实路由或状态反馈，无伪可点击控件。
- 已进入共享 OpenAPI 的业务写操作使用生成的 `@zhili/api-client`；报价创建使用 typed `POST /quotes`，接受使用 typed `POST /quotes/{quoteId}:accept` 与 `If-Match`。付款凭证、快捷入口、官网预约、平台套餐、运行恢复和订单-报价审计关联等真实契约缺口使用带准确请求路径与 DTO 的 app-local port，未借用语义无关的接口。
- Typed mock transport 对未知路由返回 404，不再以默认成功掩盖契约缺口；只有服务成功才落 UI/持久化状态，失败会保留输入和失败状态。
- 客户新运单、支付记录、地址、凭证、快捷入口全部使用 `zhili.customer.{tenantId}.{customerId}.{area}` 命名空间；客户切换测试验证不会串读。

## 状态覆盖

三端覆盖正常、加载、空、失败、无权限、陈旧、部分成功；付款/代入覆盖危险确认。非正常态不再混显正常数据或开放危险动作。陈旧态通过 API 比较本地/服务端版本并展示字段级差异，再应用服务端快照；部分成功只提交明确的失败项 ID、成功后合并，端口拒绝时保留原失败状态。状态入口通过“演示状态”选择器或对应业务动作可复现。

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

第二轮独立评审的 5 项 Important 已形成回归闭环：

- I2-01：`quote(request)` 消费并回显四项查价输入；`createOrder(input)` 消费实际地址和包裹数据。报价创建/接受接入已有 generated OpenAPI，付款凭证、快捷入口、官网预约和套餐草稿使用语义准确的 app-local 端口。
- I2-02：客户与平台的刷新、版本比较和失败项重试均调用 API port；测试覆盖精确失败 ID、成功合并与拒绝保留。
- I2-03：客户本地键包含租户与客户 ID；A/B 客户切换测试确认地址、运单等状态隔离。
- I2-04：报价以可注入当前时钟比较 `validUntil`，页面停留跨期会自动禁用；接受前再次校验，服务端 410 会留在查价页并要求重查。
- I2-05：新租户使用用户选择的默认套餐；配置页修改选中的租户实体，并在租户详情中回显同一套餐、配额和到期日。

第四轮复审的 4 项 Important 已形成回归闭环：

- I4-01：报价创建与接受均使用 generated typed operations；接受结果的 `quoteId`、`optionId` 和 version 进入订单输入，并通过 `/api/v1/portal/order-quote-links` 审计 port 关联订单版本。
- I4-02：可注入 clock 与 500ms 到期刷新覆盖展示期间跨过 `validUntil`；点击时二次校验，typed accept 的 410 映射为明确重查状态。
- I4-03：平台运行失败项成为实体状态；成功响应按 item ID 合并，失败数归零、支付回调变为健康，成功反馈保持可见；拒绝时原失败实体不变。
- I4-04：官网 Vite 使用 `appType: 'mpa'`；production preview 自动探针验证四个合法 URL 为 200，未知静态路径为 404 且不返回首页。

第五轮复审的日期有效期问题已形成回归闭环：

- I5-01：正常报价不再使用固定 `validUntil`；查询端口只采样一次可注入请求时钟，mock 按该时刻生成 `now + 8h`，跨自然日仍可正常选择。`EXPIRED` 使用相对请求时钟的已过期时间，`41000` 保持可选择并稳定由接受接口返回 410。
- I5-02：测试固定在 `2031-01-02 23:30Z`，验证有效期跨到次日 `07:30Z`，并继续推进至有效期后验证页面自动禁用。

## TDD 与自动化结果

实现按红—绿—重构推进：第四轮先新增并确认 7 个失败测试，覆盖 typed quote/accept、订单报价关联、410、展示期间跨期、运行实体合并和 production preview 404；第五轮先确认固定日期导致的 3 个失败，再补请求时钟实现并通过回归。

- 单元/集成测试：客户门户 24/24、平台端 11/11、官网 11/11（含 5 个真实 production preview 探针），总计 46/46。
- Playwright：客户 4（含 390px）、平台 2、官网桌面 2、官网移动 1、axe 1，总计 10/10。
- 第五轮 fresh 定向门禁：客户门户 24/24，客户 Playwright 4/4，官网 production preview 5/5；客户 `lint`、`typecheck`、`build` 全部通过。
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
