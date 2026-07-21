# 前端 F1 并行工作简报

三个工作树从同一 UI0 commit 建立。所有分支先运行冻结安装与基线测试，不得修改 `packages/contracts`、`packages/tokens`、`packages/ui`、数据库迁移或其他分支所有权目录。若契约缺口阻塞真实交互，先在本分支写 `docs/03-delivery/contract-proposals/<domain>.md`，由集成负责人统一处理。

## 共同完成定义

- 每个功能放入 `packages/features/<domain>/src/<feature>/` 独立目录，具有公开出口、状态、契约客户端、UI 和测试。
- 先观察失败测试；覆盖正常、加载、空、失败、无权限、过期、部分成功和危险确认，适用时覆盖长文本、脱敏和大数据。
- 控件必须真实改变前端状态并调用强类型客户端或 MSW；禁止 inert 按钮、静态截图 UI 和手写重复 DTO。
- 只使用 `@zhili/ui` 与设计令牌；桌面宽表保持高密度，不改成卡片墙，不加渐变、大圆角或多个实心主命令。
- Storybook 使用分支独有的新 story 文件；测试使用分支独有的新 spec 文件，避免修改已有共享文件。
- 分支结束时运行 `pnpm format:check`、`pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build` 和本领域 Playwright。
- 提交前写 `docs/03-delivery/evidence/<branch>.md`，列出功能 ID、测试、浏览器截图、概念图五点对照、未关闭差异和有意偏差。

## F1A `codex/frontend-ops-orders`

### F1A 所有权

- `packages/features/identity-masterdata/**`
- `packages/features/rates-routing/**`
- `packages/features/waybills/**`
- `apps/ops/src/features/orders/**`
- `apps/storybook/src/ops-orders*.stories.tsx`
- `tests/e2e/ops-orders*.spec.ts`
- `docs/03-delivery/evidence/frontend-ops-orders.md`

### F1A 必须实现

登录壳与权限模拟、运营工作台、客户/联系人、组织/仓库/合作方/币种/费用主数据、渠道产品、分区、价卡、附加费、限制、特殊价、多渠道查价与解释、标准/FBA 下单、包裹与品名、导入、运单列表、详情 Drawer、标签与批量命令。视觉必须关闭 `ui0-browser-fidelity.md` 中运营端密度差异，并匹配概念图 00/01。

## F1B `codex/frontend-ops-warehouse-finance`

### F1B 所有权

- `packages/features/warehouse/**`
- `packages/features/linehaul/**`
- `packages/features/tracking-support/**`
- `packages/features/finance/**`
- `apps/ops/src/features/fulfillment-finance/**`
- `apps/storybook/src/ops-fulfillment-finance*.stories.tsx`
- `tests/e2e/ops-fulfillment-finance*.spec.ts`
- `docs/03-delivery/evidence/frontend-ops-warehouse-finance.md`

### F1B 必须实现

收货、复重、量方、图片、库位、分货、袋/托/柜、出库、订舱、提单、清关、FBA、尾程接货/派送/POD、轨迹、问题件、退件、索赔、扣放货、应收应付、审核/反审核、账单、支付订单、预存款/未分配收款、退款、核销、余额、汇率、分摊、期间、发票和利润回查。匹配概念图 02/03；危险财务命令必须有影响、原因、版本与审计去向。

## F1C `codex/frontend-portals`

### F1C 所有权

- `apps/customer-portal/**`
- `apps/platform/**`
- `apps/website/**`
- `apps/storybook/src/portals*.stories.tsx`
- `tests/e2e/customer*.spec.ts`、`platform*.spec.ts`、`website*.spec.ts`
- `docs/03-delivery/evidence/frontend-portals.md`

### F1C 必须实现

客户门户的下单、查价、运单、轨迹、账单、付款记录、预存款/未分配收款、工单与 API 申请；平台端租户、套餐、模块、配额、到期、公告、代入、审计和运行中心；精简官网品牌、能力、登录入口、公开法律页面与 SEO。匹配概念图 04/05/07；必须关闭官网深色首屏、全页节奏和桌面/移动双快照差异，不得泄漏跨客户或平台私有数据。

## 集成负责人合并动作

1. 逐分支只读审查和复跑该分支证据。
2. 先合并 F1A 与 F1B 的领域包，再由集成负责人统一装配 `apps/ops` 路由、导航和依赖。
3. 合并 F1C；统一再生成 `pnpm-lock.yaml`，处理 E2E 文件名或配置冲突。
4. 运行五端全量视觉、a11y 与跨端标准 fixture 测试；未关闭 Important 不进入 PDA F2。
