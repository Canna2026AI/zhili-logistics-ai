# 仓库文件架构与所有权

## 目录蓝图

```text
apps/
  ops/                    # 内部运营端，仅负责壳、路由和领域模块装配
  customer-portal/        # 客户门户
  pda/                    # PDA PWA 与后续 Android 壳
  platform/               # SaaS 平台端
  website/                # 官网与公开法律页面
  api/                    # NestJS HTTP/SSE/Webhook 入口（后端阶段）
  worker/                 # BullMQ 异步任务入口（后端阶段）
  storybook/              # 共享 UI 状态与无障碍证据
packages/
  contracts/              # OpenAPI、生成类型、流程映射，集成负责人独占
  api-client/             # 强类型浏览器/API 客户端
  mocks/                  # MSW 正常与异常场景
  tokens/                 # B 方案设计令牌，UI0 owner 独占
  ui/                     # 跨端原子和物流 UI 组件，UI0 owner 独占
  features/
    identity-masterdata/  # 身份、租户、组织、客户、角色与字段策略
    rates-routing/        # 渠道、价卡、规则、报价解释与路由
    waybills/             # 订单、运单、包裹、品名、标签与批量命令
    warehouse/            # 收货、测量、库存、分货、装载与出库
    linehaul/             # 订舱、提单、清关、FBA 与尾程
    tracking-support/     # 轨迹、问题件、退件、索赔、通知与客服
    finance/              # 应收、应付、账单、支付、核销、期间与利润
    reports/              # 业务、财务和平台报表
    integrations/         # 公共 API、Webhook、UPS、DHL、Amazon、企业微信和微信支付
    automation/           # 触发器、策略、动作、重放与审批
    ai/                   # 模型网关、提示版本、映射、解释、分类和草稿
  db/                     # Drizzle schema、RLS、迁移与种子，集成负责人独占
  auth/                   # 会话与权限 SDK
  config/                 # 环境配置与启动校验
  observability/          # 日志、指标、追踪与脱敏
  testing/                # 标准 fixture、测试工厂和契约断言
infra/                    # Compose、镜像、代理、监控、备份和恢复
tests/e2e/                # 五端跨域流程、视觉、a11y 与性能入口
docs/                     # 产品、设计、架构和交付源真相
```

## 单功能目录规则

每个 `packages/features/<domain>/src/<feature>/` 目录单独拥有：

```text
index.ts                  # 唯一公共出口
model/                    # 类型、状态机、策略和纯函数
application/              # 用例、命令、查询和端口
adapters/api/             # OpenAPI 客户端或 Nest controller 映射
adapters/db/              # Repository 实现；不得绕过 RLS
ui/                       # 页面、组件、表单、表格与前端状态
worker/                   # 异步处理器（如适用）
test/                     # 单元、契约、集成、权限和负例
README.md                 # 功能 ID、状态、权限、审计和完成定义
```

领域包不得直接导入其他领域包的内部目录。共享 DTO 来自 `@zhili/contracts`；跨域行为通过公开端口或事件完成。这样每个工作树能够独立负责一组功能，合并时只在装配层发生少量冲突。

## 并行所有权

| 波次 | 分支                                   | 可写目录                                                                     |
| ---- | -------------------------------------- | ---------------------------------------------------------------------------- |
| UI0  | `codex/ui-foundation`                  | `packages/{tokens,ui,contracts,api-client,mocks}`、五端入口与工具链          |
| F1A  | `codex/frontend-ops-orders`            | `packages/features/{identity-masterdata,rates-routing,waybills}` 与对应测试  |
| F1B  | `codex/frontend-ops-warehouse-finance` | `packages/features/{warehouse,linehaul,tracking-support,finance}` 与对应测试 |
| F1C  | `codex/frontend-portals`               | `apps/{customer-portal,platform,website}`、门户专属模块与测试                |
| 集成 | `main`                                 | `apps/ops` 装配、共享依赖版本、生成文件和冲突处理                            |

PDA、后端和连接器沿用相同规则，具体波次见 `implementation-roadmap.md`。共享契约变更先由 owner 合入，再由业务工作树消费，不允许多个工作树同时改生成文件或迁移序列。
