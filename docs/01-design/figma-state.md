# Figma 设计状态

## 当前主文件

- 文件名：智立科技物流AI系统 · Design System & Product UI
- 文件地址：[打开 Figma 设计文件](https://www.figma.com/design/Mn56UdJSFmLZSmvOZSLIoX)
- File key：`Mn56UdJSFmLZSmvOZSLIoX`
- 账号：`Canna`（Full seat，Pro tier）
- Run ID：`zhili-figma-v1-20260722`
- 当前阶段：Phase 1 Foundations 已完成；Phase 2 Components 进行中

旧文件 `FJb5EAV0dx3WHZCN9zJaok` 是 Starter 阶段的历史空文件，不再作为实现目标。

## Phase 0 发现

### 代码源真相

- 设计令牌：`packages/tokens/src/styles.css`、`packages/tokens/src/index.ts`。
- 共享组件：`packages/ui/src/components/`，已实现 AppShell、Button、Input、DataTable、StatusTag、Dialog、Drawer。
- 已交付前端：运营端、客户门户、PDA、SaaS 平台端和官网；核心浏览器与 PDA 门禁已通过。
- 字体：`Noto Sans SC` 为中文 UI 主字体，`Inter` 用于英文、数字和代码；所需字重在 Figma 可用。
- Code Connect：仓库当前没有 `.figma.ts` / `.figma.tsx` / `.figma.js` 文件，Phase 3 完成组件后补建映射。

### Figma 环境

- 主文件已建立 13 个分区页面，Cover、Getting Started、Foundations 与 Components 页面均为可编辑节点，不再是空白文件。
- 已同步 4 个变量集合、61 个变量、9 个文字样式与 2 个阴影样式；变量包含 WEB code syntax 和控件边界宽度。
- Foundations 已完成颜色、排版、间距、控件/表格/壳层尺寸、圆角与阴影文档，并通过节点边界和截图检查。
- Components 已完成 Button/Primary、Button/Secondary、Button/Quiet、Button/Danger 四个组件集，共 72 个变体；每组包含 Compact/Default/Large 与 Default/Hover/Focus/Pressed/Disabled/Loading，且暴露可编辑 `Label` 属性。
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
| 令牌 | 已实现并测试 | 4 集合、61 变量、11 样式已同步 | Foundations 已完成；继续在组件与页面中验证绑定 |
| 组件 | 7 个共享核心组件已实现 | Button 四种类型、72 变体已完成；Input 进行中 | 继续完成 Input、StatusTag、DataTable、Dialog、Drawer、AppShell 与 Code Connect |
| 页面 | 五端主要页面已实现 | 空白 | Phase 3 以真实浏览器捕获作参考并组件化重建 |
| 状态 | 自动化已覆盖大量错误、离线和冲突状态 | 空白 | 依 `interaction-state-matrix.md` 建状态板和原型 |
| 竞品一致性 | 视觉与交互已在浏览器实现 | Foundations 与 Button 已有节点、截图和元数据证据 | Figma 负责团队评审、标注、映射和后续改版，不反向覆盖已验证代码语义 |

## Phase gate

Phase 0 与 Phase 1 已满足退出条件。稳定证据包括：Cover `8:2`、Getting Started `8:8`、Foundations `9:2`、Components Catalog `19:2`；Button sets 为 Primary `21:56`、Secondary `24:3`、Quiet `26:39`、Danger `28:39`。当前继续完成其余核心组件；在 Components、五端页面、10 条 Flow 与独立设计复审全部闭环前，Figma Gate 保持 `IN_PROGRESS`。
