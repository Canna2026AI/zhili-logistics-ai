# API 应用占位

后端阶段在此建立 NestJS HTTP、SSE 与 Webhook 入口。领域实现放在 `packages/features/*`，本目录只负责模块装配、请求上下文、认证、租户事务、错误映射、OpenAPI 校验和健康检查。

进入条件：全前端契约 Mock 门槛通过。API 不得在进入条件前引入与前端不一致的 DTO。
