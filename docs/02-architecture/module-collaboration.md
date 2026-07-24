# 模块协作与局部门禁

## 五端边界

| 模块     | 目录                   | 本地端口 | 主要责任                                     | 局部门禁                                    |
| -------- | ---------------------- | -------- | -------------------------------------------- | ------------------------------------------- |
| 运营端   | `apps/ops`             | 4100     | 报价、订单、运单、仓配、异常与财务工作台     | `pnpm --filter @zhili/ops test`             |
| 客户门户 | `apps/customer-portal` | 4101     | 查价下单、轨迹、账单付款、异常资料与企业设置 | `pnpm --filter @zhili/customer-portal test` |
| PDA      | `apps/pda`             | 4102     | 设备绑定、扫码、离线队列、冲突、装卸与签收   | `pnpm --filter @zhili/pda test`             |
| 平台端   | `apps/platform`        | 4103     | 租户、角色、字段策略、模拟登录与审计         | `pnpm --filter @zhili/platform test`        |
| 官网     | `apps/website`         | 4104     | 品牌、产品预览、登录入口与法律页面           | `pnpm --filter @zhili/website test`         |

应用目录只负责页面装配和该端独有的交互状态。可跨端复用的业务规则进入
`packages/features/<domain>`，HTTP DTO 进入 `packages/contracts`，浏览器传输进入
`packages/api-client`，视觉原子进入 `packages/ui`。

## 功能目录约定

每个端的 `src/features/<feature>` 是最小协作单元，至少包含：

```text
<feature>/
  index.ts                 # 唯一公开出口
  <feature>-flow.tsx       # 页面或流程编排
  <feature>-flow.test.tsx  # 行为、错误和恢复测试
  api.ts                   # 仅在该功能独占传输时存在
  styles.css               # 仅在共享令牌无法表达时存在
  README.md                # 复杂功能补充状态机和契约说明
```

禁止从另一个功能目录的内部文件深层导入。跨功能调用通过公开 `index.ts`、领域端口
或版本化事件完成。

## 分支与评审

| 变更范围         | 分支示例                          | 必需 reviewer                   |
| ---------------- | --------------------------------- | ------------------------------- |
| 单端功能         | `codex/customer-payment-recovery` | 对应端 owner                    |
| 共享 UI          | `codex/ui-table-density`          | UI owner 与至少一个消费端 owner |
| OpenAPI/生成类型 | `codex/contracts-payment-order`   | contracts owner 与后端 owner    |
| 数据库迁移       | `codex/db-receipt-allocation`     | db owner 与领域 owner           |
| 跨端流程         | `codex/e2e-payment-allocation`    | 所有被修改端的 owner            |

实现者不能作为唯一 reviewer。PR 必须说明功能 ID、目录边界、权威数据来源、失败恢复、
测试证据和回滚方式。

## 演示与生产模式

开发阶段访问运营端、客户门户、PDA 和平台端时使用 `?mock=1`。Mock 端口实现真实的
版本、幂等、冲突、部分成功和离线恢复语义，适合 UI/交互验收；它不是生产后端。
移除 `?mock=1` 后，各端只连接真实 `/api/v1`，请求失败会显式呈现，不会假装成功。

## 合并门槛

1. 先运行表格中的测试，并对同一 package 继续运行 `lint`、`typecheck`、`build` 与
   相应 Playwright project。
2. 共享契约变更运行全部 contracts 门禁并提交生成文件。
3. 合并到集成分支后运行 `pnpm format:check`、`pnpm lint`、`pnpm typecheck`、
   `pnpm test`、`pnpm build` 和 `pnpm e2e`。
4. PDA 额外验证重启恢复、弱网、媒体过期与设备接管；财务和权限操作额外验证
   409/410/412/422、重复提交和迟到响应。
