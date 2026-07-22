# 身份、租户、组织、客户与权限

本包当前状态为 `partial`。`IAM-01` 密码登录已完成；会话轮换/退出/再认证、权限模拟、主数据和信用策略提供强类型端口及当前运营页所需交互，但完整系统权限页、组织树和引用编辑器仍按功能矩阵保持 `PARTIAL`。

## 目录

- `src/session/model`：会话状态和权限范围。
- `src/session/adapters/api`：基于 `@zhili/api-client` 生成路径的登录适配器。
- `src/session/ui`：登录、加载、失败、过期和禁止态。
- `src/master-data/model`：主数据分类、演示数据和过滤规则。
- `src/master-data/ui`：分类切换、搜索和新增客户交互。
- 各功能的 `test`：端口、状态与用户交互测试。

权限范围为 `ops.login`、`iam.simulate`、`master-data.read` 和 `master-data.write`。禁止态必须显示缺少的权限范围；新增操作保留当前分类，并预留审计事件落点。

运行 `pnpm --filter @zhili/feature-identity-masterdata test|lint|typecheck|build` 验证本包。跨域 DTO 仅来自 `@zhili/contracts`，跨域行为只通过公开端口或事件。
