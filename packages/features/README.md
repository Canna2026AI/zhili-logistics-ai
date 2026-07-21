# 领域功能包

每个领域在自己的目录中按 `model/application/adapters/ui/worker/test` 拆分；每个独立功能再使用单独子目录。完整规则与并行所有权见 `docs/02-architecture/repository-structure.md`。

前端 F1 波次将在这里创建 `identity-masterdata`、`rates-routing`、`waybills`、`warehouse`、`linehaul`、`tracking-support` 与 `finance`。门户端特有页面保留在对应 `apps/*`，可复用业务逻辑仍放领域包。
