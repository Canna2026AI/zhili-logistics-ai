# UI0 浏览器视觉对照记录

日期：2026-07-22。浏览器插件在当前环境没有可调用工具，因此按前端验收规则降级为 Playwright Chromium 149。固定画布为运营/客户/平台/官网 1440×900、PDA 390×844；截图由 `pnpm e2e` 写入 `artifacts/e2e/ui0/`，CI 会重新生成。

## 对照源

| 端       | 接受的概念图                                         | 浏览器证据                                                      |
| -------- | ---------------------------------------------------- | --------------------------------------------------------------- |
| 运营端   | `docs/01-design/concepts/00-ops-waybill-list.png`    | `artifacts/e2e/ui0/ops-1440x900.png`                            |
| 客户门户 | `docs/01-design/concepts/04-customer-dashboard.png`  | `artifacts/e2e/ui0/customer-1440x900.png`                       |
| PDA      | `docs/01-design/concepts/06-pda-receive-offline.png` | `artifacts/e2e/ui0/pda-390x844.png`                             |
| 平台端   | `docs/01-design/concepts/05-platform-console.png`    | `artifacts/e2e/ui0/platform-1440x900.png`                       |
| 官网     | `docs/01-design/concepts/07-marketing-home.png`      | `artifacts/e2e/ui0/website-1440x900.png`、`website-390x844.png` |

## 已验证一致项

1. 调色板：工作区为真白和 `#F8FAFC`，导航为 `#1F2937`，主命令为纯色 `#0F766E`，未引入装饰性渐变。
2. 壳与容器：运营/平台使用 48px 顶栏、36px 页签、224px 分组侧栏；桌面宽表不降级为卡片；详情使用右侧 480px Drawer。
3. 组件几何：按钮和输入 4px、面板 6px；32px 紧凑控件和表格行；图标为统一线性 SVG，状态同时有图标和文字。
4. 标准数据：`S2505120004`、深圳鑫源贸易有限公司、122.00/123.50 kg、0.48 m³、`ST202605-0008` 与 183/200 离线队列跨端一致。
5. 交互：运营端搜索后只保留命中行并可打开详情；客户门户切换账单导航；PDA 扫描产生即时成功反馈；平台代入显示审计影响与原因；官网移动端无横向溢出。
6. 状态与可访问性：按钮 loading/disabled、输入 error、状态色、Dialog/Drawer Escape、表格本页选择均有组件测试；axe 的 WCAG A/AA DOM 检查通过，真实浏览器颜色对比由 Storybook a11y gate 继续负责。

## F1 必须关闭的差异

| 优先级    | 差异                                                                                         | 责任分支                    | 完成证据                              |
| --------- | -------------------------------------------------------------------------------------------- | --------------------------- | ------------------------------------- |
| Important | 运营端 UI0 只放置 3 行种子数据，尚未达到概念图完整工具栏、状态计数器、12 行宽表和多 Tab 密度 | `codex/frontend-ops-orders` | 00/01 原生尺寸视觉回归                |
| Important | 官网 UI0 首屏为白色组合，概念图 07 是石墨深色业务闭环首屏和更紧凑的全页节奏                  | `codex/frontend-portals`    | 07 桌面/移动截图直接对照，无新增文案  |
| Important | PDA UI0 合并展示扫描与队列，尚未实现概念图中的照片补传、登录失效、版本双栏和三种冲突决策     | `codex/frontend-pda`        | 06 两屏状态、重启/弱网 E2E            |
| Important | 客户与平台仅完成首页/代入骨架，尚未覆盖其完整页面矩阵和异常态                                | `codex/frontend-portals`    | 04/05 视觉、权限与数据边界 E2E        |
| Normal    | 1440×900 官网测试同时保存 full-page 证据，完整页面高度大于单视口                             | `codex/frontend-portals`    | 追加 1440×900 viewport 与全页两类快照 |

## 结论

UI0 已满足“可运行共享设计与交互基座”，可以作为并行前端工作的稳定起点；它不等于全前端完成。上表 Important 项必须在对应工作树合并前全部关闭，前端 Gate 才能从 `IN_PROGRESS` 改为 `PASSED`。
