# B1 Upsert 前置条件边界

日期：2026-07-22

适用操作：组织节点、用户、客户地址、合作方、渠道产品、价目版本和附加费规则的七个 Upsert API。

## 契约结论

请求体使用 `mode` 区分的封闭 `oneOf`：

- `CREATE` 变体不定义 `id`，且请求必须不携带 `If-Match`；
- `UPDATE` 变体必须携带 `id`，且请求必须携带当前资源的强 ETag；
- OpenAPI `discriminator.mapping` 将 `CREATE` 和 `UPDATE` 显式映射到对应 DTO，生成的 TypeScript 类型因此保留字面量模式；
- 每个操作的 `x-upsert-precondition` 是网关、控制器和契约测试共用的机器可读规则，不是说明性文案。

## 控制器边界

服务实现应在解析业务字段和打开事务之前执行同一条前置条件守卫：

```text
if body.mode == CREATE:
  reject when body contains id
  reject when If-Match is present

if body.mode == UPDATE:
  reject when body.id is absent
  reject when If-Match is absent or is not a strong numeric ETag
  load resource in current tenant by body.id
  reject when current ETag != If-Match
```

错误响应约定：

- 缺少必需的 `If-Match`：HTTP 412，`code=PRECONDITION_REQUIRED`；
- ETag 与当前版本不一致：HTTP 412，`code=STALE_VERSION`，返回可安全展示的当前版本和刷新建议；
- 非法组合（例如 CREATE 带 id 或 If-Match）：HTTP 422，指出 `mode/id/If-Match` 的组合错误；
- 不得通过“忽略 CREATE 的 id”或“UPDATE 默认使用版本 1”进行容错。

## 并发与租户规则

- 资源查询必须同时绑定当前租户和 `id`，避免跨租户存在性泄漏；
- ETag 比较与写入必须处于同一事务或等价的原子条件更新中；
- 幂等键在前置条件通过后按“租户 + 操作 + 键”去重，重放返回最初的权威结果；
- 审计记录应保留 `mode`、资源 id、请求 ETag、提交版本和结果，不记录敏感字段明文。

## 验收清单

七个操作都必须通过以下矩阵：

| mode   | id  | If-Match    | 结果 |
| ------ | --- | ----------- | ---- |
| CREATE | 无  | 无          | 允许 |
| CREATE | 有  | 任意        | 拒绝 |
| CREATE | 无  | 有          | 拒绝 |
| UPDATE | 有  | 当前强 ETag | 允许 |
| UPDATE | 无  | 任意        | 拒绝 |
| UPDATE | 有  | 无          | 412  |
| UPDATE | 有  | 过期 ETag   | 412  |

本文件只定义服务边界行为；本分支不修改后端控制器或数据库实现。
