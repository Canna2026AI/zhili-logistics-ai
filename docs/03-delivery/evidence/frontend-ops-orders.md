# F1A 前端交付证据：运营订单域

日期：2026-07-22

分支：`codex/frontend-ops-orders`

## 交付范围

| 功能组                               | 功能 ID                                | 实现位置                                                   |
| ------------------------------------ | -------------------------------------- | ---------------------------------------------------------- |
| 登录、会话、权限模拟                 | IAM-01、IAM-03、IAM-06                 | `packages/features/identity-masterdata/src/session`        |
| 客户、组织、仓库、合作方、引用主数据 | MDM-01、MDM-03、MDM-04、MDM-05、CRM-01 | `packages/features/identity-masterdata/src/master-data`    |
| 渠道、价卡、附加费、限制、报价与解释 | RATE-01 至 RATE-07                     | `packages/features/rates-routing/src/catalog`、`src/quote` |
| 标准/FBA 下单、包裹、品名、导入      | ORD-01 至 ORD-06                       | `packages/features/waybills/src/order`、`src/import`       |
| 运单、面单与批量命令                 | ORD-06、ORD-07、ORD-08                 | `packages/features/waybills/src/waybill`、`src/adapters`   |
| 运营壳、工作台与模块导航             | F1A composition                        | `apps/ops/src/features/orders`                             |

UI 不是静态截图：登录、筛选、搜索、选择、Drawer、标准/FBA 切换、包裹/品名增行、导入状态机、渠道选择、解释、权限模拟及危险确认均维护真实组件状态。登录、报价、解释、运单读取、提交、面单与批量命令通过 `@zhili/api-client` 生成路径和 `@zhili/contracts` DTO 进入强类型端口；列表与 Storybook 在本分支以确定性 fixture 驱动，待集成负责人接入服务端实现。

## 状态与安全

- 登录和会话：正常、加载、失败、过期、禁止。
- 主数据：正常、加载、空、失败、禁止、过期；新增客户保持当前分类。
- 报价：正常、加载、空、失败、禁止、过期、陈旧版本和成本/利润脱敏。
- 运单：正常、加载、空、失败、禁止、过期、陈旧、批量部分成功。
- 危险动作：价卡发布和取消运单均展示影响范围、原因、当前版本和审计去向；条件不全时确认按钮禁用。
- 契约保护：变更命令携带 `Idempotency-Key`，并在适用命令携带 `If-Match` 版本头。

## 测试先行记录

先创建包级/工作区行为测试并观察入口模块尚不存在的解析失败，再实现最小模型、端口和 UI，随后补齐异常态与危险确认。最终本域结果：

| Gate                  | 命令                                                    | 结果                        |
| --------------------- | ------------------------------------------------------- | --------------------------- |
| Identity tests        | `pnpm --filter @zhili/feature-identity-masterdata test` | 2 files / 6 tests passed    |
| Rates tests           | `pnpm --filter @zhili/feature-rates-routing test`       | 2 files / 8 tests passed    |
| Waybill tests         | `pnpm --filter @zhili/feature-waybills test`            | 3 files / 17 tests passed   |
| Ops composition tests | `pnpm --filter @zhili/ops test`                         | 1 file / 4 tests passed     |
| Target lint           | `pnpm exec eslint <F1A-owned paths>`                    | passed                      |
| Typecheck             | 三个领域包、`@zhili/ops`、`@zhili/storybook`            | passed                      |
| Package build         | 三个领域包、`@zhili/ops`                                | passed                      |
| Storybook build       | `storybook build --output-dir /tmp/zhili-f1a-storybook` | passed；仅既有大 chunk 警告 |
| Playwright Chromium   | `ops-orders.spec.ts`                                    | 3/3 passed                  |
| Diff hygiene          | `git diff --check`                                      | passed                      |

本地应用内浏览能力不可用，因此视觉和交互回归使用 Playwright Chromium、固定中文 locale、Asia/Shanghai 时区及 1585/1586 × 992 视口。E2E 覆盖 12 行密度、筛选、选择保持、详情 Drawer、危险批量确认、标准报价、规则解释、唯一主命令和禁止权限说明。

## 概念图 00 对照：运营运单列表

运行截图：`artifacts/e2e/f1a/ops-waybill-1586x992.png`

基准：`docs/01-design/concepts/00-ops-waybill-list.png`

1. 保留石墨色紧凑侧栏、顶部租户/搜索、页签和高密度工作区层级。
2. 状态计数横排，标准 fixture 为全部 `1,248`、待收货 `156`、待分货 `86`、待转运 `97`、转运中 `238`、已发货 `502`、已签收 `1,123`、问题件 `46`。
3. 首屏固定 12 行数据、32px 级密度、横向字段表格和行内状态徽标，关闭 UI0 的低密度差异。
4. 唯一实心主命令“新增预报”位于列表工具栏；筛选、保存视图、批量操作和行选择均可交互。
5. 480px 详情 Drawer 保留背景上下文，展示 `S2505120004`、标准重量/路线/客户/节点信息；关闭后选择不丢失。

首屏文案相对概念稿仅将品牌替换为“智立科技物流AI系统”，并使用项目冻结的 DHL 标准样例与状态中文；未引入营销文案或演示权限控件。

## 概念图 01 对照：下单与报价

运行截图：`artifacts/e2e/f1a/ops-quote-1585x992.png`

基准：`docs/01-design/concepts/01-order-quote.png`

1. 延续同一桌面壳，主体为左侧高密度下单表单、右侧固定报价和限制面板。
2. 表单按客户渠道、收寄件、包裹品名、清关附件分组，并支持标准/FBA 类型和可编辑增行。
3. 多渠道方案以单选列表呈现，可用、推荐和不可用限制不混淆；不使用卡片墙或多个实心主命令。
4. 标准费用严格为基础 `4,680.00` + 燃油 `514.80` + 偏远 `80.00` + 操作 `45.20` = `CNY 5,320.00`，并展示成本和毛利。
5. “查看解释”展开 `RATE-DHL-CN-US-2026.05-v3` 逐规则说明；底部唯一主命令为“提交预报”。

首屏文案保留业务语义但统一为本项目标准 fixture；概念稿若使用通用渠道名，本实现以冻结的 DHL/UPS 数据替代，金额、重量、线路和规则版本均与 canonical fixture 一致。

## Storybook 入口

- `F1A/OpsOrders/DenseWaybillList`
- `F1A/OpsOrders/OrderQuote`
- `F1A/OpsOrders/OperationsDashboard`
- `F1A/OpsOrders/PermissionSimulation`
- `F1A/OpsOrders/PasswordLogin`
- `F1A/OpsOrders/ExplicitStates`

## 未关闭差异与有意偏差

- 无 Critical 或 Important 视觉差异。
- 侧栏未补装饰性图标；信息层级、选中态和密度已对齐，避免修改共享 UI 包。
- 领域页面暂不改共享 `apps/ops/src/app.tsx` 路由，按 F1 简报由集成负责人合并 F1A/F1B 后统一装配；本分支提供可直接挂载的 `OpsOrdersWorkspace`。
- 本分支不实现后端持久化。生产行为已隔离在强类型 API adapter 后，Storybook/组件测试使用确定性数据，后续只替换端口实现，不需重写交互层。
- Storybook 构建存在依赖级大 chunk 警告，不影响功能、类型或 E2E；建议集成阶段统一做 story 分包。
