# 系统架构

## 1. 代码组织

使用 pnpm + Turborepo 的 TypeScript Monorepo：

```text
apps/{ops,customer-portal,pda,platform,website,api,worker,storybook}
packages/{ui,tokens,contracts,api-client,mocks,db,auth,i18n,config,observability,testing}
packages/features/{identity-masterdata,rates-routing,waybills,warehouse,linehaul,tracking-support,finance,reports,integrations,automation,ai}
docs/ infra/ tests/e2e/
```

每个功能目录包含自己的领域类型、应用服务、API 适配、前端视图和测试；跨域只能依赖 `contracts` 或明确的应用端口。数据库迁移集中生成，避免并行分支编号冲突。

## 2. 运行结构

- React/Vite 五端应用共享设计系统与生成 API 客户端。
- NestJS 模块化单体承载强事务命令和查询；独立 Worker 处理导入、打印、通知、轨迹、连接器、AI 和报表任务。
- PostgreSQL 保存事务数据并用 RLS 做租户隔离；Redis/BullMQ 保存任务与分布式锁；S3 兼容对象存储保存附件。
- API、Worker 与数据库通过事务 Outbox 保证业务提交与异步副作用一致。

## 3. 公共接口

- Base path：`/api/v1`；OpenAPI 3.1 为公共契约。
- 返回：`{ data, meta }`；错误：`{ code, message, details, remediation, requestId }`。
- 列表：`cursor`、`limit`、`sort` 和结构化 `filter`；最大页长由资源策略控制。
- 写命令：`Idempotency-Key`、`If-Match`/版本和追踪号；状态动作使用显式端点，如 `POST /waybills/{id}:submit`。
- 长任务：`GET /jobs/{id}/events` SSE；Webhook 使用时间戳、HMAC、事件 ID、版本和重放保护。

可执行源真相位于 `packages/contracts/openapi/zhili.openapi.yaml`；`core-flow-operation-map.json` 固定 10 条关键流程的 operation 覆盖，`src/generated/api.d.ts` 由契约生成。前端、后端和连接器不得手写重复 DTO。命令通过 `x-feature-id`、`x-permission` 和 `x-audit-event` 关联功能、权限和审计；Prism 提供契约 Mock，MSW 只包装相同 paths 与生成类型。

资源根：`auth`、`tenants`、`organizations`、`users`、`customers`、`master-data`、`channels`、`quotes`、`waybills`、`warehouse`、`linehaul`、`tracking`、`issues`、`finance`、`reports`、`automations`、`integrations`、`ai`、`audit-logs`。

## 4. 数据与安全

- 所有租户业务表带 `tenant_id`；请求事务写入租户上下文，RLS 默认拒绝。
- 会话使用短期访问令牌和可轮换 HttpOnly 刷新会话；密码用 Argon2id；微信通过官方 OAuth 适配器。
- API 凭据、连接器密钥和 AI 密钥使用主密钥封装加密，日志禁止输出明文。
- 状态、报价、费用、账单和权限变更写不可变审计；敏感导出也写审计。
- 金额与测量值使用 Decimal；时间存 UTC 与来源时区；币种、重量和尺寸单位显式保存。
- 公开 API 使用作用域、限流、IP 策略、密钥轮换、幂等、退避重试和死信队列。

## 5. 非功能基线

- 100 租户、单租户百万级运单、300 在线用户、仓库峰值 100 次扫描/秒。
- 普通查询 p95 < 500ms，在线扫描确认 p95 < 250ms；大导入、导出和报表异步执行。
- GitHub Actions 执行格式、静态检查、单元、集成、E2E、镜像、安全和许可证检查。
- Docker Compose 提供开发/演示环境；生产安全基线包含备份、恢复、指标、日志、追踪、限流和依赖扫描。
