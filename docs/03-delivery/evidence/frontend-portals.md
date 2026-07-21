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

## 状态覆盖

三端覆盖正常、加载、空、失败、无权限、陈旧、部分成功；付款/代入覆盖危险确认。状态入口通过“演示状态”选择器或对应业务动作可复现。

## TDD 与自动化结果

实现按红—绿—重构推进：先为客户核心链路、平台租户创建/代入、官网法律与 SEO 编写失败测试，再补实现并通过回归。

- 单元测试：客户门户 6/6、平台端 5/5、官网 4/4，总计 15/15。
- Playwright：客户 2、平台 1、官网桌面 1、官网移动 1、axe 1，总计 6/6。
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
5. 响应式：桌面 1440×900 与移动 390×844 均实测；移动官网无横向溢出，CTA 保持可见。

概念中的虚构品牌和静态按钮已替换为“智立科技物流AI系统”的真实业务状态与可执行交互；未发现影响验收的重大视觉偏差。当前环境未提供可用的应用内浏览器控制入口，因此浏览器验证使用仓库 Playwright Chromium 配置完成并留存截图。
