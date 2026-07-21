# 智立设计系统 v1

## 1. 视觉方向

方向名：清晰协作青。

- 石墨色导航形成稳定工作框架，真正白色工作区承载高密度数据。
- 青绿色只用于主操作、当前导航、链接、焦点和选中状态，避免满屏品牌色。
- 强调“扫描反馈、状态可见、金额明确、上下文不丢”，不使用装饰性渐变或大圆角卡片墙。
- 报价、异常和客服页面可出现可解释 AI 侧栏；其他页面不常驻 AI 面板。

视觉参考：`/Users/canna/.codex/generated_images/019f85fb-e33e-7972-a796-2a97994364e9/exec-743dd8da-55b4-4aee-a31e-5e92a294d47d.png`。

## 2. 设计令牌

### 色彩原语

| Token | Value | 用途 |
| --- | --- | --- |
| `white` | `#FFFFFF` | 主工作区 |
| `graphite/950` | `#111827` | 最深文字、遮罩 |
| `graphite/900` | `#1F2937` | 主导航 |
| `graphite/800` | `#273449` | 导航悬停 |
| `graphite/700` | `#374151` | 次级深色区域 |
| `graphite/600` | `#4B5563` | 正文次色 |
| `graphite/500` | `#6B7280` | 辅助文字 |
| `graphite/400` | `#9CA3AF` | 占位文字 |
| `graphite/300` | `#D1D5DB` | 强边界 |
| `graphite/200` | `#E5E7EB` | 默认边界 |
| `graphite/100` | `#F3F4F6` | 悬停/禁用面 |
| `graphite/50` | `#F8FAFC` | 页面底色 |
| `teal/900` | `#134E4A` | 强按压 |
| `teal/800` | `#115E59` | 主按压 |
| `teal/700` | `#0F766E` | 品牌主色 |
| `teal/600` | `#0D9488` | 主悬停 |
| `teal/500` | `#14B8A6` | 图表/强调 |
| `teal/100` | `#CCFBF1` | 选中面 |
| `teal/50` | `#F0FDFA` | 浅提示面 |
| `blue/600` | `#2563EB` | 信息/链接备选 |
| `green/600` | `#16A34A` | 成功 |
| `amber/600` | `#D97706` | 警告 |
| `red/600` | `#DC2626` | 错误/危险 |

语义色：`bg/page=#F8FAFC`、`bg/surface=#FFFFFF`、`bg/nav=#1F2937`、`text/primary=#111827`、`text/secondary=#4B5563`、`text/muted=#6B7280`、`border/default=#E5E7EB`、`action/primary=#0F766E`、`focus/ring=#14B8A6`。状态浅色背景使用对应主色的 8–12% 透明度或固定浅色令牌。

### 尺寸、密度与布局

- 间距：`2, 4, 6, 8, 12, 16, 20, 24, 32, 40, 48, 64`。
- 圆角：`0, 4, 6, 8, 12`；表格、工具栏和抽屉优先 4–6px。
- 控件高度：紧凑 28px、默认 32px、大 40px。
- 表格行：紧凑 32px、舒适 40px；表头 36px。
- 左侧导航：展开 224px、折叠 56px；顶部栏 48px；页签栏 36px。
- 详情抽屉：默认 480px，复杂编辑 640px；对话框 480/640/880px。
- 桌面内容最小宽度 1180px，主要设计画板 1440×900。

### 字体

中文与 UI：`Noto Sans SC`；数字、英文和代码回退 `Inter`。平台实现使用 `"Noto Sans SC", Inter, system-ui, sans-serif`。

| Style | Size/Line | Weight |
| --- | --- | --- |
| Display | 30/40 | 700 |
| H1 | 24/34 | 700 |
| H2 | 20/30 | 600 |
| H3 | 18/28 | 600 |
| Body | 14/22 | 400 |
| Body Strong | 14/22 | 600 |
| Control | 13/20 | 500 |
| Caption | 12/18 | 400 |
| Data Numeric | 13/20 | 500，启用 tabular numerals |

### 阴影与动效

- `shadow/popover: 0 8px 24px rgba(17,24,39,.12)`。
- `shadow/drawer: -8px 0 24px rgba(17,24,39,.10)`。
- 常规过渡 120ms，抽屉 180ms；遵循 `prefers-reduced-motion`。
- 焦点环 2px teal/500 + 2px 白色间隔，不能仅靠颜色表示焦点。

## 3. 组件范围

### 原子与输入

Button、IconButton、Link、Input、SearchInput、Textarea、Select、Combobox、Date/RangePicker、MoneyInput、WeightInput、Checkbox、Radio、Switch、FileUpload、BarcodeInput。

### 导航与反馈

AppShell、Sidebar、Topbar、WorkspaceTabs、Breadcrumb、Tabs、Pagination、Dropdown、Tooltip、Popover、Dialog、Drawer、Toast、Banner、StatusTag、Progress、Skeleton、EmptyState、ErrorState、PermissionState。

### 数据与物流组件

DataTable、ColumnManager、FilterBar、SavedView、BatchActionBar、StateCounterBar、KeyValueGrid、Timeline、AuditLog、QuoteBreakdown、RuleExplanation、WaybillSummary、PackageEditor、ScanFeedback、WeightMeasurePanel、LoadContainer、MoneyAllocation、StatementSnapshot、AIActionPanel。

每个组件至少定义 Default、Hover、Focus、Active、Disabled、Loading、Error；涉及危险命令时增加 Warning/Confirm。组件属性与代码 API 同名，Figma 不创建“每个图标一个变体”。

## 4. 核心交互规则

- 左侧导航按业务域，顶部多页签保留查询、滚动、筛选和未保存状态；权限或数据变更时显示过期提示。
- 列表默认为服务器分页、排序和筛选；批量动作只作用于明确选择，不把“本页”和“全部结果”混淆。
- 详情以右抽屉快速查看，复杂编辑进入页签；不可逆动作使用带影响说明和原因输入的对话框。
- 扫描操作在 250ms 内给出声音、颜色和文字反馈；重复、冲突、离线和失败反馈不能共用成功色。
- 金额始终并列币种、汇率、本位币和精度；费用修改前后显示差异与利润影响。
- 报价必须展示计费重、分区、规则版本、费用拆分、利润和不可用原因。
- 无权限显示缺失的权限或数据范围和申请路径，不伪装为空数据。
- 导入先上传、映射、校验、预览，再提交；错误可下载，提交批次可整体回滚。
- AI 自动动作显示策略、置信度、执行结果和撤销入口；关键动作进入人工审批。

## 5. 可访问性与文案

- 正文与背景至少 4.5:1，大字至少 3:1；状态同时使用文字或图标。
- 所有弹层管理焦点并支持 Esc；表格、菜单、页签和表单支持键盘导航。
- 错误文案采用“发生了什么—为什么—如何修复—谁能处理”，并附请求编号。
- 运营端文案短而明确，按钮使用领域动词：预报、收货、分货、审核、反审核、生成账单、核销、扣货、放货。
