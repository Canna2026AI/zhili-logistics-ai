# 渠道、价卡、规则、报价与路由

本包当前状态为 `partial`。`RATE-06/07` 已具备受控报价工作流、服务端 option/line/total 映射、客户端 quote/option/version 快照绑定和接受命令；渠道展示/成本字段、服务端 option 级解释及 FBA 报价上下文仍待契约扩展。渠道、分区、价卡、附加费、限制和特殊价提供运营目录与价卡发布端口，完整维护编辑器仍保持 `PARTIAL`。

## 目录

- `src/catalog/model`：渠道和价卡目录、发布校验。
- `src/catalog/ui`：目录切换、搜索和危险发布确认。
- `src/quote/model`：计费重、费用行、成本与利润计算。
- `src/quote/adapters/api`：生成式 OpenAPI 报价与解释适配器。
- `src/quote/ui`：标准/FBA 下单表单、多方案对比和规则解释。
- 各功能的 `test`：公式、权限、陈旧版本、危险动作与契约调用测试。

报价覆盖正常、加载、空、失败、禁止、过期、陈旧和成本脱敏状态。发布价卡必须展示影响范围、原因、当前版本和审计去向，并阻止重叠价格区间发布。

运行 `pnpm --filter @zhili/feature-rates-routing test|lint|typecheck|build` 验证本包。跨域 DTO 仅来自 `@zhili/contracts`，跨域行为只通过公开端口或事件。
