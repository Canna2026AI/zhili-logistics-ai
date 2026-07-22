# 智立科技物流AI系统

智立科技物流AI系统是一套面向跨境货代、国际专线、自主装柜、快递小包和尾程服务商的多租户物流业务财务一体化平台。

当前仓库以 `reports/` 中的竞品研究为需求证据，按“架构与文档 → UI/交互冻结 → 前端 → 后端 → 集成验收”的顺序建设。产品对齐 T6 的业务心智、状态流程和操作效率，但使用独立的智立品牌、设计系统、源码与文案。

UI0 已建立可运行的 React/Vite 五端入口、共享设计令牌与组件、OpenAPI 3.1 契约、强类型客户端、MSW 异常场景、Storybook 和 Playwright 浏览器验收。业务功能将按 `packages/features/<domain>/<feature>` 拆分，并通过 Git 工作树并行实现。

## 交付端

- 内部运营端：订单、报价、仓配、转运、轨迹、异常、财务和报表。
- 客户门户：下单、查价、查轨迹、账单、付款记录和工单。
- 仓库 PDA：扫描、称重、量方、分拣、装载、出库、盘点和离线补传。
- SaaS 平台端：租户、模块、配额、到期、公告、代入和审计。
- 精简官网：品牌、功能、登录入口与法律页面。

## 设计与研发文档

- `docs/00-product/product-spec.md`：产品边界、角色、领域与完整业务闭环。
- `docs/00-product/feature-traceability.md`：功能、页面、接口、权限和测试追踪矩阵。
- `docs/01-design/design-system.md`：B 风格设计令牌、组件和交互规范。
- `docs/01-design/page-matrix.md`：五端页面与状态矩阵。
- `docs/02-architecture/system-architecture.md`：Monorepo、服务、数据与接口架构。
- `docs/02-architecture/repository-structure.md`：完整目录蓝图、单功能目录规范与并行所有权。
- `docs/03-delivery/implementation-roadmap.md`：工作树波次、合并门槛和完成定义。

## 本地运行

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm dev:ops
```

五端默认端口为运营端 `4100`、客户门户 `4101`、PDA `4102`、平台端 `4103`、官网 `4104`；Storybook 使用 `6006`。完整质量门槛：

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm e2e
```

## 本地后端 Compose

后端 Compose 验收面向 macOS Docker Desktop（Linux 容器）并使用固定的 Node.js
22.22、pnpm 11.5、PostgreSQL 17、Redis 8 和 MinIO 版本。首次运行前准备依赖缓存：

```bash
corepack enable
corepack prepare pnpm@11.5.0 --activate
pnpm fetch --frozen-lockfile
pnpm install --offline --frozen-lockfile
pnpm test:compose
```

`pnpm test:compose` 会从空命名卷启动完整栈两次，执行真实对象写读、租户 RLS、
Outbox/BullMQ、容器加固、故障恢复和 SIGTERM 清理验证。第二轮在 Docker 构建网络为
`none` 且禁止拉取镜像的条件下复用冻结缓存。验收脚本忽略外部
`COMPOSE_PROJECT_NAME`，使用强随机项目名、项目专属应用镜像标签和 Docker 分配的临时
回环端口，退出时只清理本次项目资源。

复制 `infra/.env.example` 为未跟踪的 `infra/.env` 后，可手动操作：

```bash
docker compose --env-file infra/.env -f infra/compose.yaml build
docker compose --env-file infra/.env -f infra/compose.yaml up -d --wait
docker compose --env-file infra/.env -f infra/compose.yaml down --volumes --remove-orphans
```

所有开发端口只绑定回环地址：PostgreSQL `55432`、Redis `56379`、MinIO API
`59000`、MinIO Console `59001`、API `53000`。服务健康地址为
`http://127.0.0.1:53000/api/v1/health/live` 和
`http://127.0.0.1:53000/api/v1/health/ready`；前者只表示进程存活，后者同时验证
PostgreSQL、已认证 Redis 与 MinIO。

示例环境文件中的凭据仅适用于一次性本地开发，绝不能用于生产、共享或提交真实
`infra/.env`。数据库与 Redis 的 `*_PASSWORD` 是原始密码，相应
`*_PASSWORD_URL_ENCODED` 必须是同一密码的 URL 编码；启动验收会使用包含保留字符的
示例值并验证两者一致。API 与 Worker 使用相互独立的 Redis ACL 用户及 MinIO 桶级用户，
不会收到 Redis 默认用户或 MinIO root 凭据。`down --volumes` 会不可逆地删除这套本地栈
的全部一次性数据库、队列和对象数据。

## 许可证

项目以 [GNU Affero General Public License v3.0](LICENSE) 发布。生产发布阶段会进一步生成第三方许可证清单和 SBOM。
