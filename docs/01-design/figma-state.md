# Figma 设计状态

## 当前主文件

- 文件名：智立科技物流AI系统 · Design System & Product UI
- 文件地址：[打开 Figma 设计文件](https://www.figma.com/design/Mn56UdJSFmLZSmvOZSLIoX)
- File key：`Mn56UdJSFmLZSmvOZSLIoX`
- 账号：`Canna`（Full seat，Pro tier）
- Run ID：`zhili-figma-v1-20260722`
- 当前阶段：Phase 0 Discovery 完成，等待确认后进入 Phase 1 Foundations

旧文件 `FJb5EAV0dx3WHZCN9zJaok` 是 Starter 阶段的历史空文件，不再作为实现目标。

## Phase 0 发现

### 代码源真相

- 设计令牌：`packages/tokens/src/styles.css`、`packages/tokens/src/index.ts`。
- 共享组件：`packages/ui/src/components/`，已实现 AppShell、Button、Input、DataTable、StatusTag、Dialog、Drawer。
- 已交付前端：运营端、客户门户、PDA、SaaS 平台端和官网；核心浏览器与 PDA 门禁已通过。
- 字体：`Noto Sans SC` 为中文 UI 主字体，`Inter` 用于英文、数字和代码；所需字重在 Figma 可用。
- Code Connect：仓库当前没有 `.figma.ts` / `.figma.tsx` / `.figma.js` 文件，Phase 3 完成组件后补建映射。

### Figma 环境

- 新文件只有空白 `Page 1`，无本地变量、样式或组件，适合从代码源真相干净同步。
- 已订阅 Material 3、Simple Design System 和 Apple 官方设备库。
- Simple Design System 可检索到 Button、Input Field、Table、Dialog、Tag、Sidebar，以及颜色、边界、间距、圆角和排版变量。
- 复用决策：智立需要 28/32px 高密控件、4–6px 圆角、石墨导航、青绿主操作和物流专用数据组件；公共库 API 与视觉均不完全匹配，因此本地创建智立组件。外部库只作图标、可访问性和组件结构参考。

## v1 锁定范围

### Phase 1 Foundations

- Pages：`00 Cover`、`01 Foundations`、`02 Components`、`03 Ops`、`04 Customer`、`05 PDA`、`06 Platform`、`07 Website`、`99 Archive`。
- Collections：Primitives、Semantic Color、Spacing & Sizing、Typography。
- Modes：v1 只做 Light/Default；主工作区保持真白，不创建未批准的暗色模式。
- Variables：同步代码中的石墨、青绿和状态色，2–32px 间距、控件/表格/壳层尺寸及 4/6/8px 圆角，并设置 WEB code syntax。
- Styles：Display、H1、H2、H3、Body、Body Strong、Control、Caption、Data Numeric；Popover 与 Drawer 阴影。

### Phase 2 Components

- 第一批代码同名组件：AppShell、Button、Input、StatusTag、DataTable、Dialog、Drawer。
- 第二批关键物流组件：FilterBar、Tabs、QuoteBreakdown、ScanFeedback、AIActionPanel、Empty/Error/Permission/Conflict states。
- 状态：Default、Hover、Focus、Active、Disabled、Loading、Error；高风险命令补 Warning/Confirm。
- 变体矩阵按单组件不超过 30 个组合拆分，避免 Button 的尺寸、类型和异步状态笛卡尔积失控。

### Phase 3 Key Screens & Prototype

- Ops：标准运单列表/详情抽屉、查价与预报、仓库收货工作台、应收审核与核销。
- Customer：客户工作台与新建/复制运单。
- PDA：扫码收货、离线队列、同步冲突。
- Platform：租户列表/授权/系统健康。
- Website：首页桌面与移动版。
- 原型优先覆盖 `page-matrix.md` 的 10 条跨端流程，并逐步补齐加载、空、失败、无权限、数据过期、部分成功和危险确认状态。

## Code ↔ Figma 映射

| 代码 | Figma | 策略 |
| --- | --- | --- |
| `packages/tokens` | 4 个变量集合 + 文字/阴影样式 | 代码值为源真相；变量使用同名 WEB code syntax |
| `packages/ui/Button` | `Button` component set | 对齐 variant、size、disabled、loading；交互状态分层拆组 |
| `packages/ui/Input` | `Input` component set | 对齐 label、hint、error、disabled 和焦点状态 |
| `packages/ui/DataTable` | `DataTable` + row/header primitives | 保留 32px 行、36px 表头、选择、悬停、空态 |
| `packages/ui/StatusTag` | `StatusTag` component set | success/info/warning/danger/neutral 五种语义色 |
| `packages/ui/Dialog` | `Dialog` 480/640/880 | 危险确认包含影响说明和原因输入 |
| `packages/ui/Drawer` | `Drawer` 480/640 | 与主表同时可见，关闭后恢复上下文 |
| `packages/ui/AppShell` | `AppShell/Desktop` | 224/56 导航、48 顶栏、36 页签栏 |
| 各应用真实页面 | 对应端页面 + prototype flow | 先捕获浏览器像素参考，再用本地组件重建并删除临时捕获层 |

## Gap analysis

| 项目 | 代码 | Figma | 处理 |
| --- | --- | --- | --- |
| 令牌 | 已实现并测试 | 空白 | Phase 1 同步变量、scope 和 code syntax |
| 组件 | 7 个共享核心组件已实现 | 空白 | Phase 2 按真实 React API 建本地组件与 Code Connect |
| 页面 | 五端主要页面已实现 | 空白 | Phase 3 以真实浏览器捕获作参考并组件化重建 |
| 状态 | 自动化已覆盖大量错误、离线和冲突状态 | 空白 | 依 `interaction-state-matrix.md` 建状态板和原型 |
| 竞品一致性 | 视觉与交互已在浏览器实现 | 尚无画布证据 | Figma 负责团队评审、标注、映射和后续改版，不反向覆盖已验证代码语义 |

## Phase gate

Phase 0 已满足退出条件：目标文件、复用策略、v1 范围、代码映射和缺口均已明确。进入 Phase 1 前需产品负责人确认本页 v1 范围；确认后才写入 Figma 变量、样式、组件和页面节点，并记录稳定 node IDs 与截图证据。
