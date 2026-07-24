# 阶段门槛证据

只有可复查证据齐全，门槛状态才可从 `OPEN` 改为 `PASSED`。不能只靠概念图或文字声明；必须同时提供机器可检验的规格、真实接口或自动测试。

| Gate         | 状态        | Commit/版本              | 证据                                                                                               | 未关闭例外                                                                  |
| ------------ | ----------- | ------------------------ | -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| 文档         | PASSED      | `UI0-v0.1`               | 产品、范围、术语、100 项追踪、交互、架构；独立复审无 Critical/Important 问题                       | 无                                                                          |
| 本地 UI 设计 | PASSED      | `UI0-v0.1`               | 8 张统一视觉基线、设计令牌、AppShell、状态矩阵、10 条流程与契约全部复审通过                        | 无                                                                          |
| Figma 同步   | PASSED      | `Mn56UdJSFmLZSmvOZSLIoX` | 61 变量、11 样式、10 个核心组件集/95 变体、163 个五端 Flow 画面、429 条原型 reaction；终审无阻塞项 | Code Connect 受方案与发布条件阻塞，记录为 `BLOCKED_EXTERNAL`，不阻塞本门槛  |
| 前端         | PASSED      | `0d229b0`                | 五端交互 v2、生产 API ports、PDA 离线/PWA、Storybook、57 项全端 E2E 与 9 项 Ops 生产恢复全部通过   | 真实后端领域实现尚未关闭；完整交互预览必须显式使用 `?mock=1`                |
| 后端         | IN_PROGRESS | `fe56518`                | Foundation、B1 统一 schema/迁移、OpenAPI/适配器公共基线均经独立 C0/I0/M0 审查并合入主线            | 三个领域 repository、service、controller 与 Mock-off 集成仍在独立工作树实现 |
| 发布         | OPEN        | —                        | 待 Compose 冷启动、恢复、性能、安全、沙箱和矩阵报告                                                | 前置门槛未通过                                                              |

## UI 门槛与 B 方案决策

2026-07-22 采用 B 方案：以仓库中的设计系统、AppShell、交互矩阵、8 张基准图和机器可检验契约作为前端实现源真相。本地 UI 设计子门槛通过后允许前端开工；Figma 作为外部协作镜像继续补录，但不再阻塞代码实现，也不得被误记为已同步。

Figma 同步已具备以下证据：

- Figma node 链接：Foundations、Components、五端 Page Index、10 条 Flow Index。
- 组件状态：正常、加载、空、失败、无权限、过期、部分成功、危险确认；PDA 离线/冲突/结果/审计。
- 固定画布截图：1440×900、1920×1080、390×844。
- AppShell、Drawer、按钮、图标、圆角、状态色与标准 fixture 一致性记录。
- OpenAPI lint、TypeScript client 生成、MSW 契约和 flow-to-API 覆盖报告。
- 独立设计终审无 Critical/Important/Minor 未关闭项；完整报告为 `/tmp/zhili-figma-key-screens-review.md`。

Code Connect 当前是明确的外部门槛：Pro 方案与未发布的本地组件不满足其 Organization/Enterprise + 已发布 Library 前置条件，状态为 `BLOCKED_EXTERNAL`，不会以静态文档或伪映射替代真实连接。

## 2026-07-23 五端交互原型锁定证据

- Figma 主文件 `Mn56UdJSFmLZSmvOZSLIoX` 的五端 Flow 页面完成统一命名、尺寸和点击目标复验。
- Ops `6:7` 为 49 个 Flow 画面 / 70 条 reaction；Customer `6:8` 为 50 / 142；PDA `6:9` 为 29 / 74；Platform `7:2` 为 20 / 65；Website `7:3` 为 15 / 78。
- 总计 163 个 Flow 画面 / 429 条真实点击关系，覆盖 10 条核心流程的正常、选择、加载、空、失败、无权限、数据过期、部分成功、并发冲突、危险确认和恢复路径。
- Ops、Customer、PDA、Platform 与 Website 均完成点击目标审计，不存在零点击 Flow 画面；移动端画布按 390×844 检查，业务端按 1280×720 检查。
- 本轮交互冻结后才建立四个前端独立工作树；后端工作树保持暂停，继续遵守“交互 → 前端 → 后端”的顺序。

## 2026-07-24 五端交互 v2 与统一前端总门槛

- 四个前端独立工作树按 Customer/Website、PDA、Platform、Ops 顺序完成非实现者复核并合入 `main`；Ops 功能合并提交为 `65ad6b4`，最终门槛修复提交为 `0d229b0`。
- Customer 为 97/97 单测与 10/10 生产 E2E，Website 为 11/11 单测与 2/2 E2E；PDA 为 219/219 单测与 14/14 生产 E2E；Platform 为 69/69 单测与 9/9 独立生产 E2E；Ops 为 68/68 单测与 9/9 生产恢复 E2E。
- Ops 最终独立复核为 `0 Critical / 0 Important / 0 Minor`。F10 提案失败或缺失回执时 fail-closed；版本化 POST 拒绝缺失资源、错误 ID、非整数版本和未递增版本；F04 支持 `412 → GET 权威 v8 → If-Match "8" 重试`，刷新失败时保持 stale。
- 主工作树执行 `pnpm format:check`、Contracts lint/test/generate check、24/24 lint、24/24 typecheck、35/35 test tasks 和 20/20 build tasks，全部退出码 0。Worker 的 PostgreSQL/Redis Testcontainers 集成测试为 42/42。
- `CI=1 pnpm e2e` 为 57/57；`CI=1 pnpm exec playwright test --config tests/e2e/ops-production.playwright.config.ts` 为 9/9。覆盖五端桌面/390px、PDA 重启与离线、幂等恢复、并发版本、错误回执、生产恢复和 axe serious/critical 0。
- 运营生产组合根不展示演示权限或场景控制器；场景矩阵只在专用 `e2e.html` 预览装配中显式开启。前四端在后端领域实现完成前只允许通过 `?mock=1` 进入完整交互预览，生产 API 失败不会静默回退为假成功。
- 公开协作仓库为 `Canna2026AI/zhili-logistics-ai`；五端入口、共享包、模块所有权、CODEOWNERS、贡献流程和 CI 均已纳入版本控制。

## 证据记录规则

记录必须包含日期、操作者、commit、外部文件版本、测试命令、退出码和产物路径。外部限制造成的例外只能标记为 `BLOCKED_EXTERNAL`，不得标记为通过；限制解除后重新执行并覆盖为新的事实记录。

## 2026-07-22 契约证据

- OpenAPI：`packages/contracts/openapi/zhili.openapi.yaml`，OpenAPI 3.1。
- 核心流程映射：`packages/contracts/core-flow-operation-map.json`，覆盖 Flow 01–10。
- 类型：`packages/contracts/src/generated/api.d.ts` 由 `openapi-typescript 7.13.0` 生成。
- Lint：`npx @redocly/cli lint ...`，退出码 0，无错误或警告。
- Test：先观察到缺少生成类型、可执行 fixture、flow state map 和全量 P0 引用的预期失败；补齐后 Vitest 6/6 通过。
- Mock：Prism 5.14.2 启动成功；带 cookie 的报价解释 GET 返回 200，带幂等键的报价 POST 返回 201；缺 cookie 请求按契约返回 401。
- 全量引用：99 个 P0 功能行的 `x-feature-id`、`operationId`、Schema 与 Permission 全部由自动测试反向核对 OpenAPI；唯一 P1 连接器仍按版本计划保留。
- 生成一致性：由同一份 OpenAPI 重新生成 `packages/contracts/src/generated/api.d.ts`，随后重复运行契约测试通过。
- 文档质量：Markdownlint 覆盖 35 个项目 Markdown 文件，退出码 0；`git diff --check` 退出码 0。
- 范围说明：上述通过代表设计/契约基线闭合，不代表任何前端或后端功能已经实现；功能状态继续保持 `PLANNED`。

## 2026-07-22 视觉收口证据

- 8 张基准图全部重新生成；运营四屏统一 AppShell、Drawer、纯色按钮、线性图标和单一主命令。
- `S2505120004` 在运单、仓库、财务、客户门户、PDA 与官网中统一为预报 122.00 kg、实收/计费 123.50 kg。
- 报价/应收统一为 CNY 5,320.00，成本 CNY 4,580.50，毛利 CNY 739.50 / 13.90%；财务明细四行相加等于总计。
- 客户端用“预存款与未分配收款”，不再用通用钱包语义；平台模块含尾程/POD 与微信支付。
- PDA 图增加媒体补传、队列接近上限、会话过期安全、版本对比和三类冲突决策。
- 独立复审报告：`/tmp/zhili-ui-spec-local-final-pass.md`；仓库内文档、契约与本地 8 图子门槛为 `PASS`，无剩余 Critical/Important 本地问题。
- Figma Pro 写入已恢复；Foundations 与首批 7 个代码同名核心组件已完成可编辑 node、变量绑定、属性、元数据和截图验证，共 10 个组件集、95 个变体。物流专用组件、页面与原型仍在补录，因此当前为 `IN_PROGRESS`，不提前标记通过。

## 2026-07-22 UI0 代码基座证据

- pnpm/Turborepo、TypeScript、ESLint、Prettier、Changesets、Commitlint、Playwright 与 GitHub Actions 已接入。
- 五端 Vite 入口和 Storybook 均独立构建成功；共享令牌、Button、Input、StatusTag、Dialog、Drawer、DataTable 与 AppShell 使用单独目录和公共出口。
- OpenAPI 强类型客户端默认携带 Cookie；MSW 覆盖正常、空、失败、无权限、过期和部分成功六类状态，响应由生成类型约束并与正式错误包裹一致。
- 根测试共 6 个契约测试、2 个令牌测试、1 个 API 客户端测试、6 个 Mock 状态测试和 10 个 UI/a11y 测试；五端功能 Playwright 6/6、五端真实浏览器 axe 扫描 1/1 通过。
- 浏览器截图对照与未关闭差异记录在 `docs/03-delivery/ui0-browser-fidelity.md`；这些差异属于 F1/F2，而不是 UI0 共享基座完成声明。

## 2026-07-22 F1 前端门槛证据

- F1 三个独立实现工作树已合入 `main`：运营订单与报价、运营履约与财务、客户/平台/官网；各自独立复审均为 0 Critical / 0 Important。
- 运营总入口在提交 `c69f99b` 完成第二次独立复审：公开订单入口未注入 ports 时 fail closed，生产组合根默认使用 OpenAPI ports；内存端口只允许显式测试/预览注入。
- 订单、仓库、干线、轨迹和财务路由同步 URL/history；直接深链与浏览器后退已由 Vitest 和 Playwright 覆盖。并发写命令使用双引号强 ETag `If-Match`。
- 冻结依赖安装、OpenAPI 生成一致性、Prettier、18 个包 lint/typecheck/build、全仓 Vitest/Turbo 任务全部退出码 0；Ops 共 28/28 单测通过。
- `CI=1 pnpm e2e` 共 22/22 通过，覆盖运营三套、客户、平台、官网桌面/移动、当前 PDA 基线与五端首屏 axe；F1 运营相关浏览器测试为 11/11。
- 详细证据：`docs/03-delivery/evidence/frontend-ops-orders.md`、`frontend-ops-warehouse-finance.md`、`frontend-portals.md`；集成复审报告为 `/tmp/zhili-f1-integration-review.md`。
- F1 子门槛在此提交时仍不等于前端总门槛；总门槛由下节 PDA F2 与合并后全仓回归关闭。

## 2026-07-22 F2 PDA 与前端总门槛证据

- PDA 代码头为 `bab6f4a`，最终审查证据头为 `43b69a2`，合入 main 的提交为 `063a90f`。
- 设备/仓库绑定、精确 scoped task、19 个动作 payload、离线 AES-GCM IndexedDB、200 项容量、100 项批次、媒体 reservation/claim、三类冲突解决、权威尾程/POD、两阶段 RSA-OAEP-256 + AES-256-GCM 管理员接管与 PWA 离线壳均已落地。
- 独立审查记录在 `docs/03-delivery/evidence/frontend-pda-authoritative-review.md`：既有 5 Critical / 7 Important、本轮 3 Critical / 3 Important 和二轮 partial-sync 问题全部闭环，最终为 0 Critical / 0 Important / 0 Minor。
- PDA Vitest 为 12 files / 137 tests；production PDA Playwright 为 14/14；契约为 13/13，生成零差异，Redocly 0 warning / 0 error。
- 合并 main 后重新执行 frozen install、Prettier、Markdownlint、18 包 lint/typecheck/build、27 个 Turbo test/build 任务，全部退出码 0。
- `CI=1 pnpm e2e` 在 main 上为 35/35，通过五端桌面/移动、生产 PDA、PWA 离线和 axe；因此前端总门槛升级为 `PASSED`。
- 详细证据：`docs/03-delivery/evidence/frontend-pda.md` 与 `docs/03-delivery/evidence/frontend-pda-authoritative-review.md`。Android 原生壳仍需 Android SDK/真机验证；Web/PWA 已通过，不把该平台外部条件冒充为完成。

## 2026-07-22 前端响应式与搜索收口证据

- Platform 390px 紧凑导航和全局搜索、Customer 390×844 抽屉导航和全局搜索分别经过独立复审；Customer 最终复审为 0 Critical / 0 Important，活动 option 在 10 项长列表中始终完整滚入可视区。
- Customer 删除不可恢复的假报价，并覆盖 APG 虚拟焦点、Tab/Shift+Tab、Escape、外部点击、零结果、focus restore 与 forbidden 状态；Platform 覆盖实时公告与代入审计搜索索引。
- 合入 main 后执行 frozen install、Prettier、Markdownlint、18 包 lint/typecheck/build 和 27 个 Turbo test/build 任务，全部退出码 0。
- 合并后 Playwright 为 41/41，通过 Ops、Customer、PDA、Platform、Website 与共享 axe；Customer Vitest 33/33、Platform Vitest 17/17。

## 2026-07-22 五端交互复验与后端基础合并证据

- 五端开发服务固定绑定 `127.0.0.1:4100`–`4104`；浏览器逐端执行运营新建预报、客户新建运单、PDA 设备绑定与扫码入队、平台租户详情、官网登录弹窗，浏览器控制台无 error/warning。
- PDA 默认入口连接同源生产 `/api/v1` 并在后端未启动时明确返回 404；交互预览使用显式 DEV `?mock=1`，不会把生产失败静默伪装成内存成功。
- 复用现有五端服务执行 `pnpm e2e`，41/41 通过；包含五端、移动端、PDA 离线/PWA、权限、安全状态和 axe。
- 后端基础分支经独立终审为 0 Critical / 0 Important / 0 Minor，合入主分支提交 `5cb423d`；合并后 `pnpm format:check`、`pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build` 全部退出码 0。
- 后端基础证据保存在 `.superpowers/sdd/task-6-report.md`；Compose 提供 PostgreSQL、Redis、MinIO、API、Worker、迁移、RLS、幂等、审计与 Outbox 冷启动/恢复验收。B1 仍在进行，因此后端总门槛不提前标记 `PASSED`。

## 2026-07-22 B1 schema proposal 证据

- 身份主数据、费率/运单、仓储/干线三份 proposal 分别在独立工作树完成 SQL、真实 PostgreSQL 验证器、修复循环与报告；最终独立审查均为 `C0 / I0 / M0`。
- Proposal 严格复用 Foundation 的 `current_setting('app.tenant_id', true)`，身份域拥有 tenants/customers/customer_addresses/devices，费率域拥有 waybills/waybill_packages，仓储域只引用上游复合租户键，没有重复定义上游表。
- 三个分支按身份主数据 `21d1501` → 费率/运单 `ae5e5d0` → 仓储/干线 `2a26938` 合入主分支；合并后 `pnpm --filter @zhili/db test` 为 2 files / 3 tests 通过，`git diff --check` 通过且工作区干净。
- 统一迁移不由三个领域分支各自生成；它固定在 `codex/backend-b1-schema` 工作树一次性产出 Drizzle schema、`0001_b1_domains.sql`、RLS 与 up/down/up 指纹门禁，完成独立审查后再同步给领域工作树。

## 2026-07-22 B1 公共后端基线证据

- B1 统一 schema 最终提交 `a8b73d5`，独立 R4 复审为 `C0 / I0 / M0`；合入主线提交 `54b8884`。
- PostgreSQL 17 集成测试为 5 files / 27 tests，覆盖 72 张 B1 领域表、RLS、复合键与索引 parity、fresh Drizzle 建库、旧 `0000` → 新 `0001` 升级、真实 down/up 指纹、预存角色与扩展保持、平台作用域、幂等和并发 CAS。
- B1 OpenAPI、生成类型、权威适配器与 Mock 合同最终提交 `777a0a0`，独立 R5 复审为 `C0 / I0 / M0`；合入主线提交 `fe56518`。
- 契约门禁为 Redocly 0 error/warning、185/185 operationId 唯一、Contracts 32/32；secured field projection、ETag/If-Match、412 envelope、稳定游标、批量逐项版本与报价关联均由语义测试覆盖。
- 合并后的主线通过 frozen install、生成一致性、Prettier、Markdownlint、24/24 lint、24/24 typecheck、35/35 test、20/20 build、PG17 27/27 和 Playwright 41/41。
- Playwright 首轮发现平台测试仍硬编码旧数字租户 ID；改为按用户可见租户名称选择后，平台 5/5 与五端 41/41 均通过。产品租户 ID 保持正式 ULID，没有为测试回退数据模型。
- 公共基线完成不等于后端总门槛完成；身份主数据、费率订单运单、仓储干线尾程的 repository/service/controller 与跨端 Mock-off 仍按三个独立工作树实施。
