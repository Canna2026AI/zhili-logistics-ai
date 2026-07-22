# F2 PDA 离线与设备流程交付证据

日期：2026-07-22

分支：`codex/frontend-pda`

实现提交：`bab6f4a670e45403fbbcb81f6e7ae5c08057fb34`

集成提交链：

- `3d9d098`：PDA 尾程、媒体认领与管理员接管 OpenAPI 契约。
- `35c3192`：权威回执、冲突保真、两阶段加密接管与领域测试。
- `f4efc78`：scoped task 选择、动作 payload 和权限安全。
- `063934a`：PALLETIZED/UI/生产 E2E 最终集成。
- `13d755e`：权威任务刷新持久化、回执门禁、快照清理与 409 恢复闭环。
- `bab6f4a`：混合批次逐项隔离、持久化门禁与 partial-error UI 恢复。

## 交付范围

- 组合根：`apps/pda/src/app.tsx`，负责设备会话、任务、扫描、离线队列、媒体、同步、冲突和管理员接管编排。
- 功能目录：`device-session`、`scanner`、`tasks`、`offline`、`sync`、`conflicts`、`last-mile`、`ports`、`pwa`、`session`、`domain`。
- 生产默认端口：生成的 `@zhili/api-client` + `/api/v1`；仅 Vite DEV 显式 `?mock=1` 可使用内存端口。
- 发布形态：响应式 Web、可安装 PWA、生产离线静态壳、Capacitor Android 配置与 `ANDROID.md`。

## 已实现功能与不变量

### 任务与扫描安全

- 每个动作绑定唯一、当前的 scoped task：`id/reference/type/status/version` 必须完全匹配；手工扫描匹配 0 条或多条时 fail closed，IndexedDB 不写入。
- 19 个动作均使用动作特定 payload，必填业务值在入队前验证；不使用占位重量、库位、数量、收件人或任务 ID。
- 扫码枪 Enter、广播、BarcodeDetector 相机、文件选择和手工输入共用同一入队逻辑；相机不可用时释放媒体轨道并降级。
- 尾程 canonical 状态链为 `PLANNED → PALLETIZED → LOADED → OUT_FOR_DELIVERY → COMPLETED`，允许各执行态转 `EXCEPTION`；“尾程打托”已真实映射 `PALLETIZED`。

### 权威回执与媒体认领

- transition/POD 请求携带原始 `deviceEventId`、强 ETag、稳定 Idempotency-Key、准确任务 ID 和证据引用。
- 客户端只采用回执中的权威 `deliveryTask.status/version`，不本地 `+1`，不伪造同步结果。
- 媒体上传只创建 scoped reservation；`UPLOADED/SCANNING` 可进入命令认领，上传接口本身不会完成本地作业。
- 仅当 APPLIED/DUPLICATE 回执的 `deviceEventId` 与 `claimedMediaRefs` 和本地事件完全一致时，才在同一事务删除事件与所属媒体；错配、网络失败或拒绝全部保留。
- 服务端已接受的 reservation 不重复上传；只有 PENDING/RETRY 媒体会重传。

### 离线、幂等与数据安全

- IndexedDB 使用不可导出的 AES-GCM `CryptoKey` 加密事件、媒体和 meta；已有密文但密钥缺失时停止读取，不生成新密钥覆盖旧数据。
- 事件、媒体、序号和去重索引在一个事务提交；容量失败不留孤儿媒体。成功回执和删除重拍均原子删除事件+媒体。
- 容量 200，183 起预警；按本地序号每 100 条同步。成功批次即时清理，弱网后只重试未确认批次。
- 本地 pending 去重和服务端幂等分离；同一意图不重复写，不同 payload 或新的用户意图不会被永久吞掉。
- 会话到期/401 会持久化失效状态；本地数据保留。未同步数据存在时禁止跨 tenant/subject/device/warehouse 换绑。

### 冲突与错误保真

- 冲突处理先 GET 最新服务器快照与强 ETag，再支持 `KEEP_SERVER`、`REAPPLY_LOCAL`、`SUBMIT_MANUAL`。
- resolve 409 会再次刷新 diff/ETag，同时保留用户原因及原始 `status/code/requestId/remediation/details`；页面逐项呈现修复信息。
- 401、403、409、413、422 均保留完整 ErrorEnvelope；失败不会删除事件或按失败命令在本地推演任务，409 刷新后仅采用服务器权威状态与版本。

### 管理员加密接管

- 入口要求在线、至少 5 字原因和独立 `pda.takeover.export` 权限；明文队列导出永久禁用。
- 第一阶段声明 canonical manifest hash、事件/媒体计数，向服务器取得绑定 device scope 的短期 `RSA-OAEP-256` 公钥授权。
- 第二阶段将完整事件、媒体元数据和 Blob 字节打包，以随机 AES-256-GCM 密钥加密；AES 密钥用服务器 RSA 公钥包装，仅上传密文、IV、wrapped key 和双 SHA-256。
- 只有 `VERIFIED` 回执的 authorization/device scope/manifest hash/ciphertext hash/计数全部匹配时，才原子清理事件和媒体；RECEIVED、REJECTED、过期、错 scope、错 hash 或网络失败均保留。
- VERIFIED 后重载仍为空队列，并可重新认证切换仓库。

### PWA 与移动交互

- manifest、192/512 图标和静态资源可安装、可离线启动；Service Worker 不缓存 `/api/*` 认证数据。
- 390×844 下无横向溢出，触控目标和键盘 focus ring 可见；axe serious/critical 为 0。
- 队列和媒体展示双计数、证据预览、进度、错误、单媒体重试和删除重拍。

## API 覆盖

- 设备绑定、任务列表、事件批量同步、multipart 媒体 reservation。
- 冲突快照 GET 与带 If-Match 的 resolve。
- 尾程 transition、POD create/amend。
- 管理员接管 authorize 与 encrypted multipart upload。
- 所有生产请求使用 Cookie `credentials: include`；写请求使用 Idempotency-Key；版本化请求使用服务器强 ETag。

## 自动化结果

| Gate              | Fresh 结果                                              |
| ----------------- | ------------------------------------------------------- |
| ESLint            | `pnpm --filter @zhili/pda lint`，退出码 0               |
| TypeScript        | `pnpm --filter @zhili/pda typecheck`，退出码 0          |
| Vitest            | 12 files / 137 tests passed                             |
| Production build  | Vite 1702 modules；JS 279.98 kB，CSS 21.57 kB；退出码 0 |
| PDA Playwright    | 14/14 passed；390×844；含 production preview 4202       |
| PWA / axe         | 离线恢复通过；serious / critical 违规 0                 |
| Contract generate | `pnpm contracts:generate:check`，生成结果零 diff        |
| Contract tests    | 1 file / 13 tests passed                                |
| Contract lint     | Redocly recommended rules；0 warning / 0 error          |
| Prettier          | `pnpm format:check`，全部匹配                           |
| Diff              | `git diff --check` 通过                                 |

## 独立审查闭环

- 审查范围：`91434a8..c55f92e`；代码 HEAD `bab6f4a`，证据 HEAD `c55f92e`。
- 既有综合审查的 5 Critical / 7 Important 已通过精确任务绑定、原始 deviceEventId、权威回执、PALLETIZED、动作 schema、权限门禁、加密接管和生产 E2E 全部闭环。
- 本轮首审发现 3 Critical / 3 Important：离线尾程权威门禁、运行时 disposition、接管快照竞态、409 保真、0/多任务匹配及任务缓存恢复，均由 `13d755e` 修复。
- 二轮审查发现混合批次隔离、任务缓存持久化门禁及 partial-error UI 恢复问题，均由 `bab6f4a` 修复。
- 最终独立结论：**PASS — 0 Critical / 0 Important / 0 Minor**；完整可版本化报告见 `docs/03-delivery/evidence/frontend-pda-authoritative-review.md`。

复现命令：

```bash
pnpm --filter @zhili/pda lint
pnpm --filter @zhili/pda typecheck
pnpm --filter @zhili/pda test -- --run
pnpm --filter @zhili/pda build
CI=1 pnpm exec playwright test --project=pda
pnpm contracts:generate:check
pnpm contracts:test
pnpm contracts:lint
pnpm format:check
```

## 14 条浏览器场景

1. 同类型第二条任务只命中其精确 ID、reference 和 If-Match。
2. 加密事件、媒体 Blob、任务缓存与 PWA shell 跨真实 Chromium profile 关闭/重启恢复。
3. pending 本地去重与服务器 DUPLICATE 权威回执。
4. 第 201 项原子阻断；100 条分批，弱网只续传未确认批次。
5. 真实 RSA/AES 管理员接管：multipart 无明文，测试端实际解包密钥并解密验证完整事件+媒体；VERIFIED 后重载和换仓。
6. APPLIED/CONFLICT/REJECTED 混合结果与三种逐项冲突决策。
7. 相机降级、键盘焦点、250ms 内反馈、媒体预览与删除重拍。
8. mock 模式派送与不可变 POD 基础链路。
9. production `PALLETIZED → LOADED → OUT_FOR_DELIVERY → POD`，逐步校验 deviceEventId、If-Match、scanEvidence、claimedMediaRefs 和权威版本。
10. 401 后保留队列、阻止换仓、原绑定重新认证后恢复。
11. multipart 媒体失败后跨重载恢复；相同幂等键重试，已接受 reservation 不重复上传。
12. 冲突 resolve 409 刷新 diff/ETag，并保留原因、requestId、remediation、details。
13. production transition 409 拒绝回执不做本地推演，保留队列，并刷新/采用服务器权威状态版本与完整 ErrorEnvelope；重复确认只命中本地去重。
14. manifest/图标可安装，生产静态壳离线启动，不缓存 API，移动布局与 axe 通过。

## 视觉证据

对照：`docs/01-design/concepts/06-pda-receive-offline.png`。

- `artifacts/e2e/pda/offline-restart-390x844.png`
- `artifacts/e2e/pda/queue-full-390x844.png`
- `artifacts/e2e/pda/conflict-resolved-390x844.png`

石墨顶部栏、浅灰作业面、青绿色主操作和底部四导航与概念稿一致；真实实现额外提供 scope 锁、ErrorEnvelope、reservation/claim 状态、加密接管、PWA 恢复与逐项补救，不以视觉相似度替代数据安全。

## 平台边界

- Web/PWA 已完成构建与浏览器验证。
- Android 原生壳需在安装 Android SDK 的开发机按 `apps/pda/ANDROID.md` 执行 `pnpm cap:add:android`、`pnpm cap:sync` 和真机权限验证。
