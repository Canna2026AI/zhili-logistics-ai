# 契约提案：订单、运单、报价与会话缺口

日期：2026-07-22

提出分支：`codex/frontend-ops-orders`

本分支按 F1 并行简报不直接修改 `packages/contracts`。以下缺口会让生产 OpenAPI adapter 无法安全提供 UI 已需要的详情、逐项结果或不可变快照，因此当前实现一律 fail closed 或标记 `PARTIAL`，由集成负责人统一评审契约。

## 1. Waybill 详情投影

现状：`GET /waybills/{waybillId}` 的 `WaybillResponse.data` 只有 `id/waybillNo/state/allowedActions/version`，不能提供详情 Drawer 所需的主单号、客户字段策略结果、路线、服务、件重体积、分公司和轨迹。

提案：新增 `WaybillDetailProjection`，至少包含：

- `masterNo`、`route`、`service`、`transport`、`pieces`、`forecastWeightKg`、`actualWeightKg`、`volumeM3`、`createdAt`、`branch`、`timeline`；
- 客户字段使用服务端字段策略后的显示 DTO，不返回调用者无权复制/导出的明文；
- `fieldDecisions` 声明每个敏感字段的 `ALLOW/MASK/HIDE`，使页面、复制和导出共用同一决策；
- 保留 `version` 与 `allowedActions`。

在此契约落地前，`createWaybillApi().get()` 遇到基础 `Waybill` 响应会抛出 `WAYBILL_DETAIL_CONTRACT_INCOMPLETE`，不会伪造 `—/0.00` 成功详情。

## 2. 批量命令逐项结果

现状：`POST /waybills:batch-command` 返回通用 `CommandResultResponse`，没有输入 ID 对应的逐项成功、失败、错误码和最新版本。

提案：新增 `WaybillBatchCommandResponse`：

```text
data.commandId
data.items[] = { id, outcome: SUCCEEDED|FAILED, version?, error? }
```

`error` 复用 `ErrorEnvelope` 或包含 `code/message/remediation/requestId`。响应不可用总命令成功推断所有 ID 成功。在此契约落地前，adapter 缺少 `succeeded/failed` 时抛出 `WAYBILL_BATCH_RESULT_CONTRACT_INCOMPLETE`；UI 对可逐票执行的标签、提交和取消使用每票实际版本并聚合 `allSettled`。

## 3. 报价 option 与解释快照

现状：`QuoteOption` 没有渠道展示名称、成本/毛利字段；解释端点只有 `quoteId`，请求和响应均无 `optionId/quoteVersion`。`CreateQuoteRequest` 也没有 FBA 订单上下文。

提案：

- `QuoteOption` 增加权限过滤后的 `carrierName/productName`，成本字段由 `rate.cost.read` 字段策略决定；
- `GET /quotes/{quoteId}/options/{optionId}/explanation?version=`，响应必含 `quoteId/optionId/quoteVersion`；
- 报价工作流增加 `orderContext`，包含 `orderType` 与 FBA 的 `shipmentId/boxCount/fulfillmentCenter`，或者明确由独立订单草稿资源承载并在报价请求引用 `orderDraftId`。

当前 adapter 会真实映射服务端 `options/lines/total`，不会再用本地公式覆盖；解释 UI 以客户端 `quoteId + optionId + version` 绑定，契约落地前 RATE-07 仍标 `PARTIAL`。

## 4. 当前会话重新认证

现状：`POST /auth/sessions/current:reauthenticate` 的 `operationId` 为宽泛的 `reauthenticate`，请求体复用完整 `Session`，迫使客户端回传服务端会话投影；旧实现因此伪造了不合法的 `current-session` ID。

提案：

- 将 operationId 改为 `reauthenticateCurrentSession`；
- 新增 `ReauthenticateCurrentSessionRequest`，只包含重新认证所需的凭据/挑战响应，不要求客户端回传 Session；
- 当前过渡 adapter 保留登录/刷新返回的真实 ULID `session.id`，绝不合成 ID。

## 5. 导入回滚与异步提交结果

现状：rollback 请求复用开放的 `DomainRecord`，commit 返回异步 `JobResponse`，无法立即断言 created/failed 数量。

提案：新增 `RollbackImportRequest { reason, expectedVersion }` 与包含逐项结果/审计引用的回滚响应；导入任务完成结果增加 `createdRows/failedRows/errorReportRef`。当前 UI 对生产异步响应只显示入队状态，只有 port 明确返回完成数量时才展示“已创建 N 票”。
