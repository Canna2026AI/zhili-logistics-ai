# F2 PDA 离线与设备流程交付证据

日期：2026-07-22

分支：`codex/frontend-pda`

## 交付范围与文件边界

- 组合根：`apps/pda/src/app.tsx`，只负责会话、任务、离线队列、媒体、同步与页面编排。
- 独立功能目录：`device-session`、`scanner`、`offline`、`sync`、`conflicts`、`last-mile`、`tasks`、`ports`、`pwa`、`session`、`domain`。
- 生产端口：默认使用生成的 `@zhili/api-client` 和 `/api/v1`；内存端口只允许 Vite DEV 下显式 `?mock=1`。
- 移动发布：PWA manifest、192/512 图标、离线 Service Worker、Capacitor Android 配置与 `ANDROID.md` 已提供。

## 功能与安全边界

- 设备绑定返回并持久化 `tenantId`、`subjectId`、`deviceId`、`warehouseId`、权限与到期时间。任一本地事件或媒体范围不一致时，组合根 fail closed，任务、扫描、同步和冲突入口全部停用。
- 会话到期或服务端 401 会持久化失效状态；只允许重新认证原绑定。存在未同步数据时禁止换租户、用户、设备或仓库。
- 管理员接管导出保持 `PARTIAL`：服务器授权、再认证和加密接管包契约尚未提供，当前禁止生成明文导出，且不会以“导出”名义清队列。
- 每次业务意图有稳定的事件幂等键；本地 pending 去重键与服务端幂等键分离。相同 pending 意图不重复写，不同重量或新一轮用户意图不会被永久吞掉。
- IndexedDB 使用不可导出的 AES-GCM `CryptoKey` 加密事件、媒体和 meta。密钥缺失且仍有密文时停止读取，不生成新密钥覆盖旧数据。
- 事件、媒体、序号和去重索引在同一 IndexedDB 事务中提交；容量失败不留下孤儿媒体。删除“作业并重拍”也原子删除事件与所属媒体。
- 队列容量固定 200，183 起预警。同步按本地序号每 100 条分批；已确认批次立即删除，弱网中断后仅续传未确认批次。
- 媒体 Blob 可跨重载和真实浏览器进程重启恢复；上传使用稳定 Idempotency-Key，展示预览、进度、失败原因、单媒体重试和原子删除重拍。
- 冲突处理先 GET 服务器快照和强 ETag，再支持保留服务器、服务端审计重放本地、提交人工三种决策。409 会刷新字段差异并保留处理原因，客户端不会擅自重复入队。
- 尾程只使用 `PLANNED → LOADED → OUT_FOR_DELIVERY → COMPLETED/EXCEPTION` canonical states 和真实任务 version。契约未覆盖的“尾程打托”明确 disabled；POD 必须有 READY 证据才可提交。
- 扫码枪 Enter、广播事件、相机 BarcodeDetector、文件选择和手工输入共用同一入队逻辑；相机失败会停止媒体轨道并降级。首次忙碌反馈浏览器实测低于 250ms，另有颜色、文字、振动和短音反馈。

## 接口与错误处理

- 覆盖绑定、任务、事件同步、multipart 媒体、冲突 GET/resolve、尾程 transition、POD create/amend 九类 PDA 操作。
- 写命令携带 Idempotency-Key；版本化命令携带服务端强 ETag `If-Match`；API 客户端使用 Cookie `credentials: include`。
- 401、403、409、413、422 保留 `status`、`code`、`details`、`remediation` 和 `requestId`，页面使用“发生了什么/为什么/如何修复/谁能处理”结构呈现。
- 生产 E2E 通过 `/api/v1` 路由 fixture 验证请求路径、header、body、部分成功和失败保留；未落入内存模拟端口。

## 独立评审闭环

评审前记录为 9 Critical / 7 Important；当前均已形成实现与回归测试闭环：

- C01–C03：绑定范围锁、媒体范围、会话失效持久化与 401 零后续写。
- C04–C06：导出 fail closed、意图/幂等分离、事件与媒体原子提交/删除。
- C07–C08：尾程 canonical state/version 和 REAPPLY 服务端审计语义。
- C09：11 条浏览器用例使用生产 preview，含真实 persistent browser profile 重启。
- I01–I04：完整错误包裹、密钥生命周期、媒体恢复 UI、动作特定 payload 与任务版本。
- I05–I07：250ms 内反馈、可见键盘焦点、安装 manifest/图标/静态壳离线缓存且从不缓存 `/api/*`。

## 自动化结果

| Gate             | Fresh 结果                                                   |
| ---------------- | ------------------------------------------------------------ |
| ESLint           | `pnpm --filter @zhili/pda lint` 通过                         |
| TypeScript       | `pnpm --filter @zhili/pda typecheck` 通过                    |
| Vitest           | 9 files / 53 tests passed                                    |
| Production build | Vite 1701 modules，JS 262.51 kB，CSS 21.09 kB，退出码 0      |
| PDA Playwright   | 11/11 passed（17.7s），390×844，production preview 包含 4202 |
| axe              | PWA 离线恢复页 serious / critical 违规为 0                   |
| Diff             | `git diff --check` 通过                                      |

关键复现命令：

```bash
pnpm --filter @zhili/pda lint
pnpm --filter @zhili/pda typecheck
pnpm --filter @zhili/pda test
pnpm --filter @zhili/pda build
CI=1 pnpm exec playwright test --project=pda tests/e2e/pda.spec.ts
```

## 浏览器场景证据

11 条 PDA 用例覆盖：

1. 加密事件、有效图片 Blob、缓存任务和 PWA shell 跨页面重载及真实 Chromium persistent profile 关闭/重启恢复。
2. pending 意图本地去重与服务端 `DUPLICATE` 原结果。
3. 第 201 项原子阻断、导出 fail closed、第一批成功/第二批弱网失败后仅续传 101–200。
4. APPLIED、CONFLICT、REJECTED 混合 disposition 与三种逐条冲突决策。
5. 相机权限/BarcodeDetector 降级、键盘焦点、250ms 内忙碌反馈、媒体预览和删除重拍。
6. 尾程派送与不可变 POD 证据。
7. 401 后保留队列、阻止换仓、原绑定重新认证后恢复。
8. 媒体失败后跨重载保留 Blob，并用同一幂等键单媒体补传。
9. 冲突 resolve 409 后刷新 diff/ETag 并保留原因。
10. 尾程 transition 409 不推进任务；重复确认只命中本地去重，随后由事件同步恢复。
11. manifest/图标可安装，生产静态壳离线启动，不缓存认证 API，移动布局无横向溢出且 axe 通过。

## 视觉比对

对照源：`docs/01-design/concepts/06-pda-receive-offline.png`。

实测截图：

- `artifacts/e2e/pda/offline-restart-390x844.png`
- `artifacts/e2e/pda/queue-full-390x844.png`
- `artifacts/e2e/pda/conflict-resolved-390x844.png`

人工比对结论：石墨顶部栏、浅灰作业面、青绿色主操作、底部四导航、队列/媒体双计数与概念方向一致；390×844 下扫描主命令保持在可操作区域，44px 以上触控目标和青绿色 focus ring 可见。运行实现增加了概念图未表达的真实媒体预览、PARTIAL 接管说明、requestId/remediation、PWA 离线恢复和逐项恢复命令，未以视觉相似度牺牲安全状态。

## 明确边界

- “尾程打托”尚无 OpenAPI canonical state，当前 disabled 并标记契约待扩展。
- 管理员接管导出尚无服务器授权/再认证/加密包契约，当前 `PARTIAL` 且 fail closed。
- Android 原生项目需在有 Android SDK 的开发机按 `ANDROID.md` 执行 `pnpm cap:add:android` 和 `pnpm cap:sync`；Web/PWA 版本已完整构建和验证。
