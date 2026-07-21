# Figma 设计状态

- 文件名：智立科技物流AI系统 Design System
- 文件地址：[打开 Figma 设计文件](https://www.figma.com/design/FJb5EAV0dx3WHZCN9zJaok)
- File key：`FJb5EAV0dx3WHZCN9zJaok`
- Run ID：`zhili-ds-v1`

## Phase 0 发现

- 代码库：当前没有实现代码或既有令牌；竞品报告与已批准 B 视觉是首个源真相。
- Figma：新文件只有空 `Page 1`，无变量、样式或本地组件。
- 字体：已确认 `Noto Sans SC` 和 `Inter` 的 Regular、Medium、Semi Bold/Bold 等所需字重可用。
- 库：文件可访问 Material 3 与 Simple Design System；后者存在 Button 等组件。
- 复用决策：智立需要 28/32px 高密控件、4–6px 圆角、表格与物流专用组件，公共库 API 与视觉不完全匹配，因此本地创建智立组件；图标只复用一致的 SVG 语义，不继承 Material 视觉。

## v1 锁定范围

- Collections：Primitives、Semantic Color、Spacing & Sizing、Typography。
- Modes：v1 只做 Light/Default；视觉基线是真白工作区，不创建未批准暗色模式。
- Variables：约 65–80 个颜色、间距、尺寸、圆角和字体令牌，全部设置 scope 与 WEB code syntax。
- Styles：8 个文字样式、2 个阴影样式。
- Components：Button、IconButton、Input、Select、Checkbox、StatusTag、Tabs、DataTable、FilterBar、Dialog、Drawer、Toast、ScanFeedback、QuoteBreakdown、AIActionPanel 等核心族。
- Screens：内部运营、客户门户、PDA、SaaS 平台和官网的页面矩阵及 10 条关键流程。

## Gap analysis

| 项目 | 代码 | Figma | 处理 |
| --- | --- | --- | --- |
| 令牌 | 尚无 | 尚无 | 以 `design-system.md` 生成两端同源令牌 |
| 组件 | 尚无 | 尚无本地组件 | 本地创建并在代码中实现同名 API |
| 页面 | 尚无 | 尚无 | 先建页面矩阵与关键原型，再编码 |
| 视觉 | 已批准 B 概念图 | 尚未导入 | 令牌化后创建，后续与浏览器截图对比 |
| 公共库 | 不依赖 | 可用 Simple DS/M3 | 仅作结构参考，避免视觉与 API 偏离 |

## 当前外部限制

Starter 计划在 Phase 0 搜索组件库时触发 Figma MCP 调用上限。文件与发现结果已保存，但变量、组件和页面写入尚未开始。额度恢复或升级后，从 Phase 1 Foundations 继续；不得把本地文档或截图标记为 Figma 完成。
