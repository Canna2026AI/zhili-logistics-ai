# F1A 前端交付证据：运营订单域

日期：2026-07-22

分支：`codex/frontend-ops-orders`

## 可集成入口与包边界

- 组合组件：`@zhili/ops/orders` 的 `OpsOrdersWorkspace`。
- 路由注册入口：`@zhili/ops/orders-entry` 的 `opsOrdersFeatureEntry`，目标路由 `/operations/orders`。
- Ops 和 Storybook 只通过 `@zhili/feature-*` / `@zhili/ops` 公共出口导入，并在各自 `package.json` 声明 workspace 依赖；没有跨仓库相对导入。
- 本分支不越权修改共享 `apps/ops/src/app.tsx`、根 `playwright.config.ts` 或锁文件。主线集成需挂载上述 entry、把 F1A project 合并进根 Playwright，并统一刷新 `pnpm-lock.yaml`。

## 功能状态（按 operation/验收，不再整包宣称完成）

| 功能 ID                 | 状态        | 本分支可执行证据                                                                            | 尚未宣称完成的边界                             |
| ----------------------- | ----------- | ------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| IAM-01                  | IMPLEMENTED | 密码登录 UI、typed session port、失败/过期/禁止态                                           | —                                              |
| IAM-03                  | PARTIAL     | refresh/logout/reauth typed adapter 与契约测试                                              | 尚未装入共享用户菜单                           |
| IAM-06                  | PARTIAL     | 只读模拟真实保留 read、全模块禁 write、深圳范围、手机号脱敏                                 | 服务端权限预览/模拟生命周期待系统权限页        |
| MDM-01/03/04/05、CRM-01 | PARTIAL     | 主数据目录、客户异步保存/reject、信用字段、范围/脱敏；组织、地址、引用、信用 typed adapters | 组织树/库位/完整地址和引用编辑器未在本域标完成 |
| RATE-01..05             | PARTIAL     | 渠道/分区/价卡/附加费/限制/特殊价目录，计费段/进位/最低消费，价卡异步发布/reject            | 完整渠道 CRUD、限制维护编辑器未标完成          |
| RATE-06                 | IMPLEMENTED | 受控输入构造 `CreateQuoteRequest`，多渠道异步报价/reject、成本脱敏                          | —                                              |
| RATE-07                 | IMPLEMENTED | 渠道专属解释、接受不可变快照、版本/过期提示                                                 | —                                              |
| ORD-01/02               | IMPLEMENTED | 标准/FBA 草稿、包裹/品名编辑、save/copy/validate/submit typed ports                         | —                                              |
| ORD-03/04               | IMPLEMENTED | CSV BOM/引号/正重量校验，create/validate/commit/partial/rollback ports                      | XLSX 二进制解析留给上传服务                    |
| ORD-05                  | IMPLEMENTED | 包裹重量/尺寸/品名真实状态与唯一 ID                                                         | —                                              |
| ORD-06                  | PARTIAL     | label job 异步队列与版本头                                                                  | 报关/保险/附件编辑器未标完成                   |
| ORD-07                  | PARTIAL     | submit 与 renumber typed adapter                                                            | 改号 UI 尚未标完成                             |
| ORD-08                  | PARTIAL     | 批量提交/标签/取消、逐项 partial/reject；split/merge typed adapters                         | 拆合单编辑 UI 尚未标完成                       |

三个 feature package 的公开状态均为 `partial`，避免把目录 fixture 或仅存在 adapter 误报为整项 P0 完成。

## 真实交互、端口与错误处理

- Ops composition 显式注入 `OpsOrdersPorts`；Storybook 使用同一强类型 memory ports，生产可替换为 OpenAPI adapters。
- 主数据保存、价卡发布、刷新报价、加载解释、接受报价、保存/提交报价、订单保存/校验/复制/提交、导入创建/校验/提交/回滚、详情读取、标签、批量提交和取消都 `await` typed port。
- 每个异步页面命令都有 pending 禁重入、成功反馈、reject 提示和重试/内容保留；版本化命令携带 `If-Match`，创建/变更携带 `Idempotency-Key`。
- Drawer 只渲染所选 `get(waybillId)` 返回的 `WaybillDetail`，并在 scope 不匹配时拒绝显示；德国运单断言不会出现深圳客户联系人。
- 报价从受控重量构造请求。DHL 在 123.50 kg 保持 canonical `CNY 5,320.00`；改为 200 kg 后重算为 `CNY 8,537.83`。UPS 的成本、毛利和解释随所选 option 快照切换。

## RED → GREEN 记录

独立评审后先添加并运行失败回归测试，确认以下旧行为被捕获：端口 props 被忽略、保存后无行、reject 无提示、只读误作禁止读取、报价不响应 200 kg、UPS 仍显示 DHL 解释/成本、Drawer 串用联系人、导入只改本地 step、缺少 session/renumber/split/merge 调用。实现后结果如下：

| Gate                                  | Fresh 结果                                                                         |
| ------------------------------------- | ---------------------------------------------------------------------------------- |
| Identity Vitest                       | 2 files / 11 tests passed                                                          |
| Rates Vitest                          | 2 files / 14 tests passed                                                          |
| Waybills Vitest                       | 3 files / 25 tests passed                                                          |
| Ops composition Vitest                | 1 file / 4 tests passed                                                            |
| F1A Playwright collection             | 1 file / 4 tests collected（不再是 0）                                             |
| F1A Playwright Chromium               | 4/4 passed；含真实交互与 axe                                                       |
| axe                                   | DenseWaybillList、OrderQuote、PermissionSimulation 均无 serious/critical violation |
| 5 个 TypeScript checks                | identity、rates、waybills、ops、storybook passed                                   |
| Builds                                | 3 个 feature 声明构建、Ops tsc/Vite、Storybook passed                              |
| Target ESLint / Prettier / diff-check | passed                                                                             |

标准复现命令：

```bash
node_modules/.bin/playwright test --config tests/e2e/ops-orders.playwright.config.ts --list
node_modules/.bin/playwright test --config tests/e2e/ops-orders.playwright.config.ts
```

专属配置自行启动 Storybook，不依赖预先运行的 6006 服务。Browser plugin 本轮不可用，因此按前端测试 skill 使用 Playwright Chromium fallback。

## 概念图 00：运营运单列表

运行截图：`artifacts/e2e/f1a/ops-waybill-1586x992.png`

基准：`docs/01-design/concepts/00-ops-waybill-list.png`

1. 石墨色紧凑侧栏、租户/搜索、页签和高密度工作区层级保持一致。
2. 状态计数横排；首屏固定 12 行和 32px 级密度，关闭 UI0 低密度差异。
3. 唯一实心主命令“新增预报”，筛选、选择、Drawer 和危险批量命令均真实响应。
4. 480px Drawer 保留背景上下文，关闭不丢选择；详情 loading/reject/scope 独立处理。
5. canonical `S2505120004` 与德国 `S2505120002` 分别由各自详情数据渲染，不拼接其他客户 PII。

## 概念图 01：下单与报价

运行截图：`artifacts/e2e/f1a/ops-quote-1585x992.png`

基准：`docs/01-design/concepts/01-order-quote.png`

1. 左侧高密度下单表单、右侧固定报价与限制面板保持一致。
2. 标准/FBA、地址、包裹、品名与清关分组均保留真实表单状态。
3. 多渠道单选清楚区分推荐、可用和限制，不使用卡片墙或多个实心主命令。
4. 费用逐行相加严格等于总计，并按当前计费重和渠道实时更新成本/毛利。
5. “查看解释”和“接受报价”读取当前 option/version 的不可变快照；底部唯一主命令为“提交预报”。

## 主线集成待办（不属于本工作树所有权）

1. 在共享 `apps/ops/src/app.tsx` 挂载 `opsOrdersFeatureEntry`，使生产 bundle 路由进入 F1A。
2. 将 `ops-orders.playwright.config.ts` 的 project/webServer 合并进根 `playwright.config.ts`，使根 `pnpm e2e` 自动包含 F1A。
3. 合并各工作树 manifests 后统一运行冻结安装并提交刷新后的 `pnpm-lock.yaml`。
