# 实施与工作树路线

## 阶段门槛

1. 文档门槛：产品规格、追踪矩阵、状态机、财务不变量、API 与目录经过一致性检查。
2. UI 门槛：Figma 令牌、组件、五端页面和 10 条关键流程通过视觉/交互验收。
3. 前端门槛：所有页面使用契约 Mock 实现，核心控件真实交互，视觉回归与可访问性通过。
4. 后端门槛：真实数据库/API/Worker 完成，关闭 Mock 后跨端流程通过。
5. 发布门槛：功能追踪矩阵全部 `VERIFIED`，Compose 冷启动、备份恢复、性能、安全和外部沙箱通过。

## 工作树规则

- 工作树统一位于 `.worktrees/<name>`，分支统一为 `codex/<english-name>`。
- 同时最多三个实现工作树，根任务保留为契约、审查和集成负责人。
- 一个工作树只负责一个领域范围；共享契约先由集成负责人合入。
- PR 标题中英双语，必需检查通过后 squash merge。
- 每个功能严格走测试先行：先观察失败，再写最小实现，再重构。

## 前端波次

| Branch | 所有权 |
| --- | --- |
| `codex/frontend-ops-orders` | 运营壳、主数据、报价、订单和运单 |
| `codex/frontend-ops-warehouse-finance` | 仓库、干线、客服和财务 |
| `codex/frontend-portals` | 客户门户、平台端和官网 |
| `codex/frontend-pda` | PDA PWA、离线和 Android 壳 |

## 后端波次

| Branch | 所有权 |
| --- | --- |
| `codex/backend-identity-masterdata` | 租户、身份、权限、组织和主数据 |
| `codex/backend-rates-waybills` | 渠道、规则、报价、订单和运单 |
| `codex/backend-warehouse-linehaul` | 扫描、仓储、装载、订舱和提单 |
| `codex/backend-finance` | 应收、应付、账单、资金、发票和利润 |
| `codex/backend-tracking-support` | 轨迹、异常、工单和通知 |
| `codex/backend-integrations-ai` | API、连接器、自动化、AI、导入导出和报表任务 |

## 统一验收

- 单元/属性测试：规则、状态机、财务守恒、幂等和 AI 策略。
- 数据库测试：RLS、约束、迁移、并发和事务 Outbox。
- Playwright：五端关键流程、权限负例、跨端一致性和视觉回归。
- PDA：扫码广播、相机、离线队列、重启恢复和冲突。
- 契约：OpenAPI、Webhook 签名、乱序、重试、限流和死信。
- 负载：百万级查询、300 并发和 100 扫描/秒。
- 安全：OWASP、依赖、镜像、秘密、日志脱敏和备份恢复。
- 外部：UPS、DHL、Amazon、企业微信和微信支付官方沙箱/测试环境。
