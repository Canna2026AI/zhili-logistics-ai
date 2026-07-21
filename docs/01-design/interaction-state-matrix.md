# 关键流程与异常态矩阵

本页把 10 条 P0 流程从 happy path 展开为可实现、可原型、可测试的状态。每个状态在 Figma、MSW 和 Playwright 中使用相同 `Flow ID / State ID / operationId / error code`。机器映射位于 `packages/contracts/core-flow-state-map.json` 并由 Vitest 校验。服务端操作使用 OpenAPI `operationId`；纯客户端行为使用 `clientAction:` 前缀，不得把本地队列或界面选择伪装成 API。

## 1. 共享页面状态

| State ID | UI 证据 | 行为与补救 |
| --- | --- | --- |
| `NORMAL` | 完整数据、来源时点、允许动作 | 主命令与当前状态机一致 |
| `LOADING` | 首屏骨架；后台刷新保留旧数据 | 超过 8 秒显示取消/后台运行 |
| `EMPTY` | 对象、筛选条件和创建权限可见 | 区分真正为空与筛选无结果 |
| `FAILED` | 错误码、请求号、原因和补救 | 可重试时保留输入和幂等键 |
| `FORBIDDEN` | 缺失 action/data scope/field policy | 提供申请权限与安全返回，不伪装为空 |
| `STALE` | 本地/服务器版本与差异 | 刷新、比较或基于新版本重试 |
| `PARTIAL` | 成功/失败数量、逐条结果、报告 | 只重试失败项并复用原批次 |
| `DANGER` | 影响、前置检查、原因、二次确认 | 高风险操作要求再认证或审批 |
| `LARGE` | 总量、虚拟滚动、服务器查询 | 全结果动作转异步 Job |
| `MASKED` | 明确脱敏占位和权限提示 | 复制/导出沿用字段策略 |

## 2. Flow 01 客户下单到仓库收货

正常步骤：`createOrderDraft → validateOrder → createQuote → submitWaybill → receiveScan → confirmReceipt`。页面为客户/运营下单、报价解释和收货工作台。

| 分支 | State ID | 必须呈现与处理 |
| --- | --- | --- |
| 正常 | `F01-NORMAL` | 地址、品名、限制和报价逐项通过；主命令只为“提交预报”；收货页确认实重、照片和差异后“确认收货” |
| 失败 | `F01-FAILED-LIMIT` | `CHANNEL_RESTRICTION` 定位到字段/包裹，展示不可用规则和替代渠道，不丢草稿 |
| 并发 | `F01-STALE` | 运单在另一个终端已收货时显示版本差异；禁止再次收货，可查看原扫描事件 |
| 权限 | `F01-FORBIDDEN` | 无 `waybill.submit` 或 `warehouse.receive` 时说明缺失动作；不得显示可点击主按钮 |
| 离线 | `F01-OFFLINE` | PDA 生成本地事件与媒体队列；恢复后去重，冲突进入人工处理，不重复生成费用 |

## 3. Flow 02 多渠道查价与保存版本

正常步骤：`createQuote → clientAction:compareQuoteOptions → getQuoteExplanation → clientAction:selectQuoteOption → acceptQuote`。

| 分支 | State ID | 必须呈现与处理 |
| --- | --- | --- |
| 正常 | `F02-NORMAL` | 每个渠道显示计费重、分区、规则版本、费用拆分、利润、限制与有效期 |
| 失败 | `F02-FAILED-NO-RATE` | `NO_APPLICABLE_RATE` 显示被排除规则、缺失数据和可修复字段 |
| 并发 | `F02-STALE-RATE` | 价卡发布新版本时保留旧结果并提示重新计算；用户明确接受后生成新报价版本 |
| 权限 | `F02-MASKED-COST` | 无成本权限时成本与利润脱敏，复制/导出同样脱敏 |
| 过期 | `F02-EXPIRED` | 报价过有效期禁止接受，提供“按当前规则重算”并保留原快照 |

## 4. Flow 03 收货差异到恢复分货

正常步骤：`confirmReceipt → createIssue → requestIssueMaterial → resolveIssue → routeWaybill`。

| 分支 | State ID | 必须呈现与处理 |
| --- | --- | --- |
| 正常 | `F03-NORMAL` | 差异展示预报/实收/比例和证据；工单与运单主状态并行；解决后恢复分货 |
| 失败 | `F03-FAILED-MISSING-EVIDENCE` | 关闭工单缺少必需附件时定位缺项，不改变运单可操作性 |
| 并发 | `F03-STALE` | 客户补资料与操作员关闭同时发生时比较版本，要求重新确认解决结论 |
| 权限 | `F03-FORBIDDEN` | 客户只能补资料和评论，不能修改责任、结论或内部备注 |
| 部分成功 | `F03-PARTIAL-NOTIFY` | 工单已创建但通知失败时业务提交成功；显示通知 Job 并允许重试 |

## 5. Flow 04 订舱/提单/装柜到出仓

正常步骤：`createBooking → attachWaybills → createBillOfLading → createLoadUnit → sealLoadUnit → dispatchLoadUnit`。

| 分支 | State ID | 必须呈现与处理 |
| --- | --- | --- |
| 正常 | `F04-NORMAL` | 主从工作台显示订舱、提单、柜/托和运单层级；兼容检查通过后封装与出仓 |
| 失败 | `F04-FAILED-INCOMPATIBLE` | 危险品、目的地、渠道或状态不兼容逐条解释，可下载报告 |
| 并发 | `F04-STALE-LOAD` | 他人已拆除或封装时刷新 load version；封装后禁止静默增删 |
| 权限 | `F04-FORBIDDEN-RELEASE` | 信用扣货时只有 `hold.release` 可放货，必须原因和审批链 |
| 危险确认 | `F04-DANGER-DISPATCH` | 出仓前展示运单数、重量、费用缺口、未关闭问题和打印状态 |

## 6. Flow 05 轨迹停滞到问题件关闭

正常步骤：`ingestTrackingEvent → detectTrackingStall → createIssue → assignIssue → notifyCustomer → resolveIssue`。

| 分支 | State ID | 必须呈现与处理 |
| --- | --- | --- |
| 正常 | `F05-NORMAL` | 轨迹按事件时间显示并标记来源；停滞规则生成工单、SLA 和通知 |
| 失败 | `F05-FAILED-CARRIER` | 承运商超时不覆盖旧轨迹；显示最后成功同步和退避计划 |
| 乱序/重复 | `F05-OUT-OF-ORDER` | 重复事件去重；迟到事件插入正确时间点并保留接收时间 |
| 权限 | `F05-FORBIDDEN-INTERNAL` | 客户看不到内部责任、成本和私密备注 |
| 部分成功 | `F05-PARTIAL-NOTIFY` | 工单关闭成功、客户通知失败时显示可重试通知，不回滚关闭 |

## 7. Flow 06 应收到收款核销

正常步骤：`generateCharges → reviewCharge → createStatement → createStatementPaymentOrder → ingestWechatPaymentCallback → allocateReceipt`。

| 分支 | State ID | 必须呈现与处理 |
| --- | --- | --- |
| 正常 | `F06-NORMAL` | 费用差异、利润、账单快照、支付状态、已核销和未收金额同屏可追溯 |
| 失败 | `F06-FAILED-PAYMENT` | 支付失败/关闭不改账单；可创建新订单，旧订单仍可查 |
| 回调重复/乱序 | `F06-IDEMPOTENT` | 同一微信交易只入账一次；金额/商户不符隔离到支付异常队列 |
| 并发 | `F06-STALE-ALLOCATE` | 两人核销同一余额时按版本拒绝后者，显示当前可分配金额 |
| 危险确认 | `F06-DANGER-UNREVIEW` | 反审核/撤销核销显示下游账单、支付分配和期间影响，要求原因 |

## 8. Flow 07 应付导入到利润回查

正常步骤：`createPayableImport → validatePayableImport → commitPayableImport → reconcilePayables → createDisbursement → allocateDisbursement`。

| 分支 | State ID | 必须呈现与处理 |
| --- | --- | --- |
| 正常 | `F07-NORMAL` | 映射、预校验、差异、供应商对账、付款分配和利润影响可追溯 |
| 失败 | `F07-FAILED-IMPORT` | 错误定位到 sheet/row/column，允许在线修复和下载报告 |
| 部分成功 | `F07-PARTIAL` | 默认原子批次；用户明确允许部分提交时生成成功/失败清单和回滚边界 |
| 并发 | `F07-STALE-COST` | 已审核成本不被导入覆盖；生成调整建议而不是静默修改 |
| 权限 | `F07-FORBIDDEN-PAY` | 制单和付款分权；付款需要审批、再认证和审计 |

## 9. Flow 08 权限配置与用户视角验证

正常步骤：`updateRolePolicy → previewEffectivePermissions → startPermissionSimulation → verifyAsSubject → endPermissionSimulation`。

| 分支 | State ID | 必须呈现与处理 |
| --- | --- | --- |
| 正常 | `F08-NORMAL` | 模板、直接授权、拒绝、数据范围和字段策略以差异视图合并 |
| 失败 | `F08-FAILED-LOCKOUT` | 阻止删除最后一名租户管理员或让自己失去恢复权限 |
| 并发 | `F08-STALE` | 角色被他人修改时展示策略 diff，禁止覆盖新版本 |
| 权限 | `F08-FORBIDDEN` | 模拟器只能由 `iam.simulate` 使用，敏感字段仍受审计和脱敏 |
| 会话变化 | `F08-SESSION` | 即时生效的撤权终止受影响会话；非即时变更明确要求重新登录 |

## 10. Flow 09 PDA 离线扫描与冲突处理

正常步骤：`clientAction:enqueueOfflineScan → clientAction:persistLocalQueue → clientAction:resumeAfterRestart → syncDeviceEvents → resolveDeviceConflict`。

| 分支 | State ID | 必须呈现与处理 |
| --- | --- | --- |
| 正常 | `F09-NORMAL` | 顶部始终显示在线/离线、待同步数和照片进度；成功反馈含运单与动作 |
| 重复 | `F09-DUPLICATE` | 本地去抖与服务端幂等都命中原结果；明确“已处理”而非错误 |
| 冲突 | `F09-CONFLICT` | 展示本地事件、服务器状态、差异和允许决策：保留服务器、重新应用、提交人工 |
| 队列满/登录失效 | `F09-BLOCKED` | 队列接近上限先警告；满后停止新业务扫描但允许导出/同步；登录失效保护本地数据 |
| 重启/换仓 | `F09-RESTART` | 加密队列重启恢复；存在未同步事件时禁止换用户/仓库，除非管理员导出并接管 |

离线事件 envelope 必含 `eventId/deviceId/localSequence/tenantId/warehouseId/subjectId/action/entityRef/payload/mediaRefs/baseVersion/idempotencyKey/occurredAt/timezone/appVersion`。服务端返回 `APPLIED/DUPLICATE/CONFLICT/REJECTED` 和可执行补救。

## 11. Flow 10 AI Excel 映射到关键写入审批

正常步骤：`createImportJob → proposeAiMapping → validateImportRows → applyLowRiskMappings → requestAiApproval → approveAiAction → commitImport`。

| 分支 | State ID | 必须呈现与处理 |
| --- | --- | --- |
| 正常 | `F10-NORMAL` | 显示模型、提示版本、字段证据、置信度和策略；低风险映射可批量接受 |
| 低置信度 | `F10-LOW-CONFIDENCE` | 不自动应用，突出候选和来源列，要求人工选择 |
| 模型失败 | `F10-FAILED-MODEL` | 保留文件和手工映射能力；重试不重复提交导入批次 |
| 越权/高风险 | `F10-FORBIDDEN` | AI 不能越过调用者字段权限；金额、状态和关键主数据进入审批 |
| 撤销 | `F10-ROLLBACK` | 显示模型输出、人工修改和最终写入 diff；批次回滚保留审计和外部副作用说明 |

## 12. Figma 与测试命名

Figma Frame 命名为 `Flow/{Flow ID}/{State ID}/{Page ID}`。原型首页按 Flow 01–10 排列；正常路径用实线，失败/权限/并发分支用明确标签。Playwright 用例 ID 与 State ID 相同，失败截图输出到 `artifacts/e2e/{State ID}`。
