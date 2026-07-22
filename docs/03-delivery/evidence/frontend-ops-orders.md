# F1A 前端交付证据：运营订单域

日期：2026-07-22

分支：`codex/frontend-ops-orders`

## 可集成入口与包边界

- 组合组件：`@zhili/ops/orders` 的 `OpsOrdersWorkspace`。
- 路由注册入口：`@zhili/ops/orders-entry` 的 `opsOrdersFeatureEntry`，目标路由 `/operations/orders`。
- Ops 和 Storybook 只通过 `@zhili/feature-*` / `@zhili/ops` 公共出口导入，并在各自 `package.json` 声明 workspace 依赖；没有跨仓库相对导入。
- 本分支不越权修改共享 `apps/ops/src/app.tsx`、根 `playwright.config.ts` 或锁文件。主线集成需挂载上述 entry、把 F1A project 合并进根 Playwright，并统一刷新 `pnpm-lock.yaml`。

## 功能状态（按 operation/验收，不再整包宣称完成）

| 功能 ID                 | 状态        | 本分支可执行证据                                                                            | 尚未宣称完成的边界                              |
| ----------------------- | ----------- | ------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| IAM-01                  | IMPLEMENTED | 密码登录 UI、typed session port、失败/过期/禁止态                                           | —                                               |
| IAM-03                  | PARTIAL     | refresh/logout/reauth typed adapter 与契约测试                                              | 尚未装入共享用户菜单                            |
| IAM-06                  | PARTIAL     | 只读模拟真实保留 read、全模块禁 write、深圳范围、手机号脱敏                                 | 服务端权限预览/模拟生命周期待系统权限页         |
| MDM-01/03/04/05、CRM-01 | PARTIAL     | 主数据目录、客户异步保存/reject、信用字段、范围/脱敏；组织、地址、引用、信用 typed adapters | 组织树/库位/完整地址和引用编辑器未在本域标完成  |
| RATE-01..05             | PARTIAL     | 渠道/分区/价卡/附加费/限制/特殊价目录，计费段/进位/最低消费，价卡异步发布/reject            | 完整渠道 CRUD、限制维护编辑器未标完成           |
| RATE-06                 | PARTIAL     | 地址/邮编/件数/重量/尺寸/FBA 受控工作流请求；真实映射服务端 options/lines/total；reject     | 渠道展示名、成本字段及 FBA 报价上下文待契约扩展 |
| RATE-07                 | PARTIAL     | 客户端按 quote/option/version 绑定解释，切渠道/输入立即失效；accept reject                  | 服务端解释契约尚无 optionId/quoteVersion        |
| ORD-01/02               | PARTIAL     | 标准/FBA 草稿、包裹/品名编辑、save/copy/validate/submit ports；校验 items/remediation       | FBA/结构化品名字段待订单契约扩展                |
| ORD-03/04               | PARTIAL     | CSV BOM/引号/正重量校验，异步 commit 结果、危险 rollback 确认/reject                        | 文件上传、任务轮询、错误报告下载未标完成        |
| ORD-05                  | PARTIAL     | 包裹重量/尺寸/品名状态与唯一 ID；详情按 scope/字段策略渲染                                  | 生产 WaybillDetail 投影待契约扩展               |
| ORD-06                  | PARTIAL     | label job 异步队列与版本头                                                                  | 报关/保险/附件编辑器未标完成                    |
| ORD-07                  | PARTIAL     | submit 与 renumber typed adapter                                                            | 改号 UI 尚未标完成                              |
| ORD-08                  | PARTIAL     | 标签/提交/取消按每票实际版本 allSettled，逐项 partial/reject；split/merge adapters          | 服务端 batch item-result 契约、拆合单 UI 待完成 |

三个 feature package 的公开状态均为 `partial`，避免把目录 fixture 或仅存在 adapter 误报为整项 P0 完成。

## 真实交互、端口与错误处理

- Ops composition 显式注入 `OpsOrdersPorts`；Storybook 使用同一强类型 memory ports，生产可替换为 OpenAPI adapters。
- 主数据保存、价卡发布、报价 create/explain/accept/save/submit、订单 save/validate/copy/submit、导入 create/validate/commit/rollback、详情读取、标签、批量提交和取消都 `await` typed port；本轮为真实 P0 命令补充 resolve/reject/partial 测试。
- 版本化命令携带 `If-Match`，创建/变更携带 `Idempotency-Key`。异步 commit 只显示服务端 job 状态，不再把本地 CSV 行数伪装成服务端创建结果。
- Drawer 只渲染所选 `get(waybillId)` 返回的详情，并统一应用 scope 与字段策略；只读场景的客户、编码、联系人和手机号脱敏，复制/导出类未接入命令保持 disabled。
- 报价由地址、邮编、件数、重量、长宽高和 FBA 上下文构造工作流请求；材积重和总价随刷新快照更新。OpenAPI adapter 直接映射服务端 options/lines/total，缺响应即 fail closed。
- 受契约阻塞的 Waybill 详情、批量 item result、报价 option/version 解释和 reauthenticate request 已记录在 `docs/03-delivery/contract-proposals/orders-auth-quote.md`，没有修改共享 contracts。
- 高级筛选、保存视图、服务端刷新/分页/列配置、复制/改号/拆合单编辑器、问题件登记、品名文件导入等未接端口的可见控件均 disabled 并带“待集成/待契约扩展”原因，不再产生本地伪成功。

## RED → GREEN 记录

二轮复审后先添加并运行失败回归测试，确认以下旧行为被捕获：session id 被丢弃、服务端报价被本地金额覆盖、尺寸/FBA 不进入请求、切渠道/输入后保留旧解释、只读 Drawer 泄露明文、标签/提交部分成功被整批 catch 掩盖、取消版本写死、导入回滚无确认、服务端提交数量被本地行数替代、详情/批量契约缺字段时伪成功。实现后结果如下：

| Gate                                  | Fresh 结果                                                                         |
| ------------------------------------- | ---------------------------------------------------------------------------------- |
| Identity Vitest                       | 2 files / 11 tests passed                                                          |
| Rates Vitest                          | 2 files / 20 tests passed                                                          |
| Waybills Vitest                       | 3 files / 43 tests passed                                                          |
| Ops composition Vitest                | 1 file / 4 tests passed                                                            |
| Vitest total                          | 8 files / 78 tests passed                                                          |
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
2. 标准/FBA、地址、邮编、件数、重量和长宽高均进入受控工作流；当前报价契约不支持的 HS/申报/清关控件明确 disabled。
3. 多渠道单选清楚区分推荐、可用和限制，不使用卡片墙或多个实心主命令。
4. memory fixture 的费用逐行相加等于总计；生产 adapter 直接消费服务端 lines/total，未返回的成本不伪造。
5. “查看解释”和“接受报价”只作用于当前 option/version；切渠道或改输入立即清空旧解释，脏输入先刷新再操作。

## 主线集成待办（不属于本工作树所有权）

1. 在共享 `apps/ops/src/app.tsx` 挂载 `opsOrdersFeatureEntry`，使生产 bundle 路由进入 F1A。
2. 将 `ops-orders.playwright.config.ts` 的 project/webServer 合并进根 `playwright.config.ts`，使根 `pnpm e2e` 自动包含 F1A。
3. 合并各工作树 manifests 后统一运行冻结安装并提交刷新后的 `pnpm-lock.yaml`。
