# 阶段门槛证据

只有可复查证据齐全，门槛状态才可从 `OPEN` 改为 `PASSED`。不能只靠概念图或文字声明；必须同时提供机器可检验的规格、真实接口或自动测试。

| Gate         | 状态        | Commit/版本              | 证据                                                                         | 未关闭例外                                                        |
| ------------ | ----------- | ------------------------ | ---------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| 文档         | PASSED      | `UI0-v0.1`               | 产品、范围、术语、100 项追踪、交互、架构；独立复审无 Critical/Important 问题 | 无                                                                |
| 本地 UI 设计 | PASSED      | `UI0-v0.1`               | 8 张统一视觉基线、设计令牌、AppShell、状态矩阵、10 条流程与契约全部复审通过  | 无                                                                |
| Figma 同步   | IN_PROGRESS | `Mn56UdJSFmLZSmvOZSLIoX` | Foundations、61 变量、11 样式、Button 72 变体已有可编辑节点和截图证据        | 其余核心组件、五端页面、10 条 Flow、Code Connect 与独立复审待完成 |
| 前端         | PASSED      | `063a90f`                | 五端、生产 API ports、PDA 离线/PWA、Storybook、35 项 Playwright/axe 全部通过 | Figma 同步仍为外部协作镜像，不阻塞已验证的本地实现                |
| 后端         | OPEN        | —                        | 待 API、DB、Worker、RLS 和集成报告                                           | 前端门槛已通过；下一波从 Backend Foundation 开始                  |
| 发布         | OPEN        | —                        | 待 Compose 冷启动、恢复、性能、安全、沙箱和矩阵报告                          | 前置门槛未通过                                                    |

## UI 门槛与 B 方案决策

2026-07-22 采用 B 方案：以仓库中的设计系统、AppShell、交互矩阵、8 张基准图和机器可检验契约作为前端实现源真相。本地 UI 设计子门槛通过后允许前端开工；Figma 作为外部协作镜像继续补录，但不再阻塞代码实现，也不得被误记为已同步。

Figma 同步完成时仍需补齐以下证据：

- Figma node 链接：Foundations、Components、五端 Page Index、10 条 Flow Index。
- 组件状态：正常、加载、空、失败、无权限、过期、部分成功、危险确认；PDA 离线/冲突/重启。
- 固定画布截图：1440×900、1920×1080、390×844。
- AppShell、Drawer、按钮、图标、圆角、状态色与标准 fixture 一致性记录。
- OpenAPI lint、TypeScript client 生成、MSW 契约和 flow-to-API 覆盖报告。
- 独立设计评审无 Critical/Important 未关闭项；仓库内本地复审已满足，Figma 节点需另行复查。

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
- Figma Pro 写入已恢复；Foundations 与 Button 组件族已完成可编辑 node、变量绑定、元数据和截图验证。其余组件、页面与原型仍在补录，因此当前为 `IN_PROGRESS`，不提前标记通过。

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
