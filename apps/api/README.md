# Zhili API

NestJS 11 + Fastify 5 的 HTTP 装配层。领域逻辑属于 `packages/features/*`；本应用只负责启动安全、全局请求管线、健康探针和 OpenAPI 覆盖守卫。HTTP 前缀固定为 `/api/v1`，请求体上限为 1 MiB。

## 本地运行

在仓库根目录执行：

```bash
pnpm install --frozen-lockfile
pnpm --filter @zhili/api dev
```

生产式构建与启动：

```bash
pnpm --filter @zhili/api build
pnpm --filter @zhili/api start
```

启动前会严格校验以下环境变量：

| 变量                             | 用途                                                     |
| -------------------------------- | -------------------------------------------------------- |
| `DATABASE_URL`                   | PostgreSQL 应用角色连接串，不得绕过 RLS                  |
| `REDIS_URL`                      | Redis 连接串，支持 `redis://` 和 `rediss://` 及 ACL 凭据 |
| `S3_ENDPOINT`                    | S3/MinIO endpoint；readiness 访问 `/minio/health/ready`  |
| `S3_ACCESS_KEY`, `S3_SECRET_KEY` | 对象存储凭据                                             |
| `SESSION_KEY`                    | 会话密钥                                                 |
| `ENVELOPE_MASTER_KEY`            | 信封加密主密钥                                           |
| `PORT`                           | HTTP 端口，默认 `3000`                                   |
| `LOG_LEVEL`                      | Pino 级别，默认 `info`                                   |
| `NODE_ENV`                       | `development` / `test` / `production`                    |

## 健康语义

- `GET /api/v1/health/live` 只证明进程可服务，绝不查询外部依赖。
- `GET /api/v1/health/ready` 并发检查 PostgreSQL、Redis 和对象存储。每个探针有 1 秒上限；全部正常时返回 `200`，任一失败或超时时返回 `503`。
- 探针结果只输出 `up`/`down`、耗时和安全的错误类别，不返回 URL、凭据或原始异常。
- 两个公共端点仍会生成或传播 `x-request-id`。

## 全局管线

执行顺序固定为：

1. `AuthenticatedPrincipalGuard`
2. `PermissionGuard`
3. `RequestContextInterceptor`
4. `IdempotencyInterceptor`
5. controller handler
6. `ProblemFilter` 统一映射异常

`@PublicRoute()` 只跳过认证/授权，不隐式跳过幂等保护。租户、主体和权限只从经信任的 `AuthenticatedPrincipal` 构建，不读取 body 或 query 中的身份字段。本应用未注册任何手写 DTO `ValidationPipe`；HTTP DTO 仍以 OpenAPI 为唯一来源。

## 特性模块与契约覆盖

`registerFeatureModule(module)` 返回一个无全局可变注册表的确定性 DynamicModule：

```ts
const rootModule = registerFeatureModule(WaybillsModule);
const app = await createApiApplication(rootModule);
```

每个已实现 handler 必须用 `@ContractOperation('<operationId>')` 声明 OpenAPI operationId。CI 守卫从 Nest `DiscoveryService` 读取已编译 controller 元数据，合并 `/api/v1` + controller path + method path，并同时校验 method、path 和 operationId。

所有 `POST`/`PUT`/`PATCH`/`DELETE` handler 还必须显式三态分类：

- `@IdempotentCommand()` 必须对应 OpenAPI 声明 `Idempotency-Key` 的 operation。
- `@SkipIdempotency()` 必须对应未声明该 header 的 operation，例如登录或外部回调。
- 未分类 mutation 在运行时仍会 fail-closed，但 coverage guard 会直接使 CI 失败。

## 关闭

Nest graceful-shutdown hooks 在 bootstrap 时启用。`app.close()` 或支持的进程信号会关闭 Fastify 并排空共享 PostgreSQL client；Redis 和对象存储探针的短连接也会在完成、失败或超时时主动释放。
