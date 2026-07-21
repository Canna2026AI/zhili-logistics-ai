# 功能追踪矩阵

状态枚举：`PLANNED`、`DESIGNED`、`FRONTEND`、`BACKEND`、`VERIFIED`。只有页面、真实接口、持久化、权限、审计和自动测试同时存在时才能标记 `VERIFIED`。`DESIGNED` 必须有可编辑 Figma node 证据，概念图不能单独升级状态。

Owner 缩写：`ROOT` 为集成/契约，`UI` 为令牌与共享组件，`FO` 为运营订单前端，`FW` 为仓库财务前端，`FP` 为门户前端，`FD` 为 PDA 前端；`BI/BR/BW/BF/BT/BX` 对应后端六个领域工作树。所有 `operationId` 必须存在于 OpenAPI；测试 ID 必须在最终验收报告中可定位。

| ID | P | 可独立验收的行为 | Page | Flow | operationId | Schema | Permission | Test | Owner | Evidence / Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| PLT-01 | P0 | 创建、停用、恢复租户 | PLT-TENANTS | — | `createTenant` / `changeTenantStatus` | Tenant | `platform.tenant.manage` | PLT-E2E-01 | FP/BI | `page-matrix.md` / PLANNED |
| PLT-02 | P0 | 配置模块授权、到期和配额 | PLT-TENANT-DETAIL | — | `updateTenantEntitlements` | TenantEntitlement | `platform.entitlement.write` | PLT-E2E-02 | FP/BI | `product-spec.md` / PLANNED |
| PLT-03 | P0 | 限时代入、必填原因、退出和超时 | PLT-IMPERSONATION | — | `startImpersonation` / `endImpersonation` | ImpersonationSession | `platform.impersonate` | PLT-SEC-03 | FP/BI | `app-shell-spec.md` / PLANNED |
| IAM-01 | P0 | 账号密码登录、注销和 Argon2id 校验 | ALL-LOGIN | — | `loginWithPassword` / `logout` | Session | `public` | IAM-SEC-01 | FP/BI | `product-spec.md` / PLANNED |
| IAM-02 | P0 | 官方微信 OAuth 登录与账号绑定 | ALL-LOGIN | — | `startWechatLogin` / `completeWechatLogin` | OAuthBinding | `public` | IAM-E2E-02 | FP/BI | `scope-decisions.md` / PLANNED |
| IAM-03 | P0 | 刷新会话轮换、撤权失效和再认证 | ALL-SESSION | F08 | `refreshSession` / `reauthenticate` | Session | `session.active` | IAM-SEC-03 | FP/BI | `interaction-state-matrix.md` / PLANNED |
| IAM-04 | P0 | 资源动作和数据范围鉴权 | OPS-PERMISSIONS | F08 | `updateRolePolicy` | RolePolicy | `iam.policy.write` | IAM-PROP-04 | FO/BI | `product-spec.md` / PLANNED |
| IAM-05 | P0 | 字段读写、脱敏、复制和导出策略 | OPS-PERMISSIONS | F02/F05 | `previewFieldPolicy` | FieldPolicy | `iam.policy.read` | IAM-SEC-05 | FO/BI | `app-shell-spec.md` / PLANNED |
| IAM-06 | P0 | 模板差异、最终权限预览与用户视角模拟 | OPS-PERMISSION-SIM | F08 | `previewEffectivePermissions` / `startPermissionSimulation` | PermissionPreview | `iam.simulate` | F08-NORMAL | FO/BI | `interaction-state-matrix.md` / PLANNED |
| MDM-01 | P0 | 公司、部门、站点、仓库与库位版本化维护 | OPS-ORGANIZATION | — | `upsertOrganizationNode` | OrganizationNode | `masterdata.organization.write` | MDM-E2E-01 | FO/BI | `page-matrix.md` / PLANNED |
| MDM-02 | P0 | 员工、设备和仓库绑定 | OPS-USERS | F09 | `upsertUser` / `bindDevice` | User / Device | `identity.user.write` | MDM-E2E-02 | FO/BI | `product-spec.md` / PLANNED |
| MDM-03 | P0 | 客户、联系人和地址簿按数据范围维护 | OPS-CUSTOMERS | F01 | `createCustomer` / `upsertCustomerAddress` | Customer | `customer.write` | MDM-SCOPE-03 | FO/BI | `page-matrix.md` / PLANNED |
| MDM-04 | P0 | 代理、供应商和合作尾程服务商维护 | OPS-PARTNERS | F04 | `upsertPartner` | Partner | `partner.write` | MDM-E2E-04 | FO/BI | `product-spec.md` / PLANNED |
| MDM-05 | P0 | 国家、港口、机场、币种、费用和品名引用约束 | OPS-REFERENCE | — | `publishReferenceDataVersion` | ReferenceDataVersion | `masterdata.reference.publish` | MDM-INT-05 | FO/BI | `page-matrix.md` / PLANNED |
| CRM-01 | P0 | 客户等级、信用额度和付款周期策略 | OPS-CUSTOMER-CREDIT | F04 | `updateCustomerCreditPolicy` | CreditPolicy | `customer.credit.write` | CRM-PROP-01 | FO/BI | `product-spec.md` / PLANNED |
| CRM-02 | P0 | 出仓扣货与授权放货 | OPS-DISPATCH-CHECK | F04 | `placeShipmentHold` / `releaseShipmentHold` | ShipmentHold | `hold.place` / `hold.release` | F04-FORBIDDEN-RELEASE | FW/BF | `interaction-state-matrix.md` / PLANNED |
| RATE-01 | P0 | 渠道、产品、服务范围与版本维护 | OPS-CHANNELS | F02 | `upsertChannelProduct` | ChannelProduct | `rate.channel.write` | RATE-INT-01 | FO/BR | `page-matrix.md` / PLANNED |
| RATE-02 | P0 | 分区、重量段、材积、进位和最低消费 | OPS-RATECARD | F02 | `publishRateCard` | RateCardVersion | `rate.card.publish` | RATE-PROP-02 | FO/BR | `product-spec.md` / PLANNED |
| RATE-03 | P0 | 成本、代理、客户、特殊价和有效期 | OPS-RATECARD | F02 | `upsertRatePriceVersion` | RatePriceVersion | `rate.price.write` | RATE-PROP-03 | FO/BR | `product-spec.md` / PLANNED |
| RATE-04 | P0 | 燃油、偏远、超长和操作附加费逐项计算 | OPS-SURCHARGES | F02 | `upsertSurchargeRule` | SurchargeRule | `rate.surcharge.write` | RATE-GOLD-04 | FO/BR | `canonical-fixtures.md` / PLANNED |
| RATE-05 | P0 | 渠道限制、不可用原因和替代建议 | OPS-RESTRICTIONS | F01/F02 | `validateShipmentRestrictions` | RestrictionResult | `quote.create` | F01-FAILED-LIMIT | FO/BR | `interaction-state-matrix.md` / PLANNED |
| RATE-06 | P0 | 多渠道查价、排序和成本字段脱敏 | OPS-QUOTE | F02 | `createQuote` | Quote | `quote.create` | F02-NORMAL | FO/BR | `canonical-fixtures.md` / PLANNED |
| RATE-07 | P0 | 报价解释、接受和不可变快照 | OPS-QUOTE-DETAIL | F02 | `getQuoteExplanation` / `acceptQuote` | QuoteExplanation | `quote.accept` | F02-STALE-RATE | FO/BR | `interaction-state-matrix.md` / PLANNED |
| ORD-01 | P0 | 标准/FBA 订单草稿、新建和复制 | OPS-ORDER-EDIT | F01 | `createOrderDraft` / `copyOrder` | OrderDraft | `order.create` | ORD-E2E-01 | FO/BR | `page-matrix.md` / PLANNED |
| ORD-02 | P0 | 地址、品名、报关和渠道限制预校验 | OPS-ORDER-EDIT | F01 | `validateOrder` | OrderValidation | `order.validate` | F01-FAILED-LIMIT | FO/BR | `interaction-state-matrix.md` / PLANNED |
| ORD-03 | P0 | Excel 上传/粘贴、映射、预校验和错误报告 | OPS-ORDER-IMPORT | F10 | `createImportJob` / `validateImportRows` | ImportJob | `order.import` | F10-NORMAL | FO/BX | `interaction-state-matrix.md` / PLANNED |
| ORD-04 | P0 | 导入提交、部分成功选择和批次回滚 | OPS-ORDER-IMPORT | F07/F10 | `commitImport` / `rollbackImportBatch` | ImportCommit | `order.import.commit` | F07-PARTIAL | FO/BX | `interaction-state-matrix.md` / PLANNED |
| ORD-05 | P0 | 包裹、重量、尺寸和品名行编辑 | OPS-WAYBILL-DETAIL | F01 | `upsertWaybillPackages` | Package | `waybill.package.write` | ORD-INT-05 | FO/BR | `canonical-fixtures.md` / PLANNED |
| ORD-06 | P0 | 报关、保险、附件和面单版本 | OPS-WAYBILL-DETAIL | F01 | `updateWaybillDeclaration` / `createLabelJob` | Declaration / LabelJob | `waybill.declaration.write` | ORD-INT-06 | FO/BR | `page-matrix.md` / PLANNED |
| ORD-07 | P0 | 提交预报、取消和改号的状态命令 | OPS-WAYBILL-DETAIL | F01 | `submitWaybill` / `cancelWaybill` / `renumberWaybill` | Waybill | `waybill.submit` | F01-STALE | FO/BR | `app-shell-spec.md` / PLANNED |
| ORD-08 | P0 | 拆单、合单和批量部分成功 | OPS-WAYBILLS | — | `splitWaybill` / `mergeWaybills` / `batchWaybillCommand` | BatchCommand | `waybill.batch` | UI-PARTIAL-08 | FO/BR | `design-system.md` / PLANNED |
| WH-01 | P0 | 扫码匹配预报并幂等生成收货事件 | OPS-RECEIVE | F01 | `receiveScan` | WarehouseScan | `warehouse.receive` | F01-OFFLINE | FW/BW | `canonical-fixtures.md` / PLANNED |
| WH-02 | P0 | 复重、量方、照片和计费重比较 | OPS-RECEIVE | F01/F03 | `recordMeasurement` / `attachReceiptMedia` | Measurement | `warehouse.measure` | WH-PROP-02 | FW/BW | `canonical-fixtures.md` / PLANNED |
| WH-03 | P0 | 收货差异、确认收货和授权撤销 | OPS-RECEIVE | F03 | `confirmReceipt` / `undoReceipt` | Receipt | `warehouse.receipt.confirm` | F03-NORMAL | FW/BW | `interaction-state-matrix.md` / PLANNED |
| WH-04 | P0 | 上架、移库、盘点和库存一致性 | OPS-INVENTORY | — | `moveInventory` / `commitStocktake` | InventoryMovement | `warehouse.inventory.write` | WH-PROP-04 | FW/BW | `page-matrix.md` / PLANNED |
| WH-05 | P0 | 分货、替代渠道和不可用解释 | OPS-ROUTING | F03 | `routeWaybill` | RoutingDecision | `warehouse.route` | F03-NORMAL | FW/BW | `interaction-state-matrix.md` / PLANNED |
| WH-06 | P0 | 袋/托/柜扫描加入、拆除和封装 | OPS-LOAD-UNIT | F04 | `createLoadUnit` / `attachWaybills` / `sealLoadUnit` | LoadUnit | `warehouse.load.write` | F04-STALE-LOAD | FW/BW | `interaction-state-matrix.md` / PLANNED |
| WH-07 | P0 | 拣货、出仓检查和交接 | OPS-DISPATCH | F04 | `dispatchLoadUnit` | DispatchResult | `warehouse.dispatch` | F04-DANGER-DISPATCH | FW/BW | `interaction-state-matrix.md` / PLANNED |
| WH-08 | P0 | 浏览器/本地代理打印、队列、重打和幂等 | OPS-PRINT-JOBS | F04 | `createPrintJob` / `reprintDocument` | PrintJob | `document.print` | DOC-E2E-08 | FW/BW | `scope-decisions.md` / PLANNED |
| PDA-01 | P0 | PDA 登录、设备与仓库绑定、扫码广播/相机 | PDA-HOME | F09 | `bindDevice` / `getDeviceTasks` | DeviceSession | `pda.use` | PDA-DEVICE-01 | FD/BI | `page-matrix.md` / PLANNED |
| PDA-02 | P0 | 离线事件持久化、重启恢复、去重和批量同步 | PDA-OFFLINE | F09 | `syncDeviceEvents` | DeviceEventEnvelope | `pda.sync` | F09-RESTART | FD/BW | `interaction-state-matrix.md` / PLANNED |
| PDA-03 | P0 | 媒体补传、冲突详情和逐条解决 | PDA-CONFLICT | F09 | `uploadDeviceMedia` / `resolveDeviceConflict` | DeviceConflict | `pda.conflict.resolve` | F09-CONFLICT | FD/BW | `interaction-state-matrix.md` / PLANNED |
| LINE-01 | P0 | 创建订舱、班次与提货计划 | OPS-BOOKING | F04 | `createBooking` | Booking | `linehaul.booking.create` | LINE-E2E-01 | FW/BW | `page-matrix.md` / PLANNED |
| LINE-02 | P0 | 提单主从关系与运单归集 | OPS-BOL | F04 | `createBillOfLading` | BillOfLading | `linehaul.bol.write` | F04-NORMAL | FW/BW | `interaction-state-matrix.md` / PLANNED |
| LINE-03 | P0 | 报关、集包、卡板和装柜兼容检查 | OPS-LOAD-UNIT | F04 | `validateLoadCompatibility` | CompatibilityResult | `linehaul.load.validate` | F04-FAILED-INCOMPATIBLE | FW/BW | `interaction-state-matrix.md` / PLANNED |
| LINE-04 | P0 | FBA 箱号和 Amazon 货件关联 | OPS-FBA | — | `linkFbaShipment` | FbaShipmentLink | `linehaul.fba.write` | LINE-INT-04 | FW/BX | `scope-decisions.md` / PLANNED |
| LM-01 | P0 | 尾程接货批次、清单与实扫差异 | OPS-LM-INTAKE | — | `createLastMileIntake` / `scanLastMileIntake` | LastMileIntake | `lastmile.intake` | LM-E2E-01 | FW/BW | `product-spec.md` / PLANNED |
| LM-02 | P0 | 派送任务、路线、司机/合作方和时间窗 | OPS-LM-DELIVERY | — | `createDeliveryTask` | DeliveryTask | `lastmile.delivery.plan` | LM-E2E-02 | FW/BW | `product-spec.md` / PLANNED |
| LM-03 | P0 | 打托、装车、派送和异常扫描 | PDA-LM-DELIVERY | — | `updateDeliveryTaskStatus` | DeliveryEvent | `lastmile.delivery.execute` | LM-DEVICE-03 | FD/BW | `page-matrix.md` / PLANNED |
| LM-04 | P0 | 签收姓名、位置、照片/签名和 POD 版本 | PDA-POD | — | `captureProofOfDelivery` / `amendProofOfDelivery` | ProofOfDelivery | `lastmile.pod.write` | LM-INT-04 | FD/BW | `product-spec.md` / PLANNED |
| LM-05 | P0 | 合作方下发、回传、状态对账和重放 | OPS-LM-PARTNER | — | `syncLastMilePartner` / `replayPartnerEvent` | PartnerSyncEvent | `integration.lastmile.manage` | LM-CONTRACT-05 | FW/BX | `scope-decisions.md` / PLANNED |
| LM-06 | P0 | 尾程应收应付和合作方对账 | OPS-LM-FINANCE | F07 | `generateLastMileCharges` | Charge | `finance.charge.generate` | LM-FIN-06 | FW/BF | `product-spec.md` / PLANNED |
| TRK-01 | P0 | 承运商轨迹去重、乱序和来源时间 | OPS-TRACKING | F05 | `ingestTrackingEvent` | TrackingEvent | `tracking.ingest` | F05-OUT-OF-ORDER | FW/BT | `interaction-state-matrix.md` / PLANNED |
| TRK-02 | P0 | 人工轨迹、签收和 POD 读取 | OPS-TRACKING | F05 | `appendManualTrackingEvent` | TrackingEvent | `tracking.manual.write` | TRK-AUDIT-02 | FW/BT | `product-spec.md` / PLANNED |
| TRK-03 | P0 | 轨迹停滞检测与自动建问题件 | OPS-TRACKING | F05 | `detectTrackingStall` | TrackingStall | `automation.execute` | F05-NORMAL | FW/BT | `interaction-state-matrix.md` / PLANNED |
| CS-01 | P0 | 问题件创建、责任人、SLA 和内部/客户可见性 | OPS-ISSUES | F03/F05 | `createIssue` / `assignIssue` | Issue | `issue.manage` | F05-FORBIDDEN-INTERNAL | FW/BT | `interaction-state-matrix.md` / PLANNED |
| CS-02 | P0 | 客户补资料、评论和问题件解决 | CUS-ISSUE | F03 | `requestIssueMaterial` / `resolveIssue` | IssueMaterial | `issue.collaborate` | F03-STALE | FW/BT | `interaction-state-matrix.md` / PLANNED |
| CS-03 | P0 | 退件、破损、丢失和索赔 | OPS-CLAIMS | — | `createClaim` / `settleClaim` | Claim | `claim.manage` | CS-E2E-03 | FW/BT | `page-matrix.md` / PLANNED |
| FIN-01 | P0 | 规则生成应收/应付费用和来源解释 | OPS-CHARGES | F06/F07 | `generateCharges` | Charge | `finance.charge.generate` | FIN-PROP-01 | FW/BF | `product-spec.md` / PLANNED |
| FIN-02 | P0 | 费用修改、审核、反审核和调整单 | OPS-CHARGE-DETAIL | F06 | `reviewCharge` / `unreviewCharge` / `adjustCharge` | ChargeReview | `finance.charge.review` | F06-DANGER-UNREVIEW | FW/BF | `interaction-state-matrix.md` / PLANNED |
| FIN-03 | P0 | 应付 Excel 导入、差异与原子/部分提交 | OPS-PAYABLE-IMPORT | F07 | `createPayableImport` / `commitPayableImport` | PayableImport | `finance.payable.import` | F07-PARTIAL | FW/BF | `interaction-state-matrix.md` / PLANNED |
| FIN-04 | P0 | 账单冻结快照、版本、发送和争议 | OPS-STATEMENTS | F06 | `createStatement` / `sendStatement` / `openStatementDispute` | Statement | `finance.statement.write` | FIN-GOLD-04 | FW/BF | `canonical-fixtures.md` / PLANNED |
| FIN-05 | P0 | 收款、付款和未分配余额 | OPS-CASH | F06/F07 | `recordReceipt` / `createDisbursement` | CashTransaction | `finance.cash.write` | FIN-PROP-05 | FW/BF | `product-spec.md` / PLANNED |
| FIN-06 | P0 | 部分/全部核销、撤销核销和并发守恒 | OPS-ALLOCATIONS | F06/F07 | `allocateReceipt` / `reverseAllocation` | Allocation | `finance.allocation.write` | F06-STALE-ALLOCATE | FW/BF | `interaction-state-matrix.md` / PLANNED |
| FIN-07 | P0 | 多币种、汇率版本和本位币快照 | OPS-EXCHANGE-RATES | — | `publishExchangeRateSet` | ExchangeRateSet | `finance.exchange.publish` | FIN-PROP-07 | FW/BF | `product-spec.md` / PLANNED |
| FIN-08 | P0 | 费用分摊、余额和利润回查 | OPS-PROFIT | F07 | `allocateCharges` / `getProfitTrace` | ProfitTrace | `finance.profit.read` | FIN-PROP-08 | FW/BF | `interaction-state-matrix.md` / PLANNED |
| FIN-09 | P0 | 期间关闭、授权调整和重开 | OPS-PERIODS | — | `closeFinancialPeriod` / `reopenFinancialPeriod` | FinancialPeriod | `finance.period.close` | FIN-SEC-09 | FW/BF | `product-spec.md` / PLANNED |
| FIN-10 | P0 | 发票抬头、申请、审批、红冲状态和附件 | OPS-INVOICES | — | `createInvoiceRequest` / `reviewInvoiceRequest` | InvoiceRequest | `finance.invoice.write` | FIN-E2E-10 | FW/BF | `scope-decisions.md` / PLANNED |
| PAY-01 | P0 | 增加预存款并进入未分配余额 | CUS-PREPAYMENT | F06 | `createPrepaymentOrder` | PaymentOrder | `payment.create` | PAY-PROP-01 | FP/BF | `scope-decisions.md` / PLANNED |
| PAY-02 | P0 | 创建账单支付订单、查询和关闭 | CUS-PAYMENT | F06 | `createStatementPaymentOrder` / `closePaymentOrder` | PaymentOrder | `payment.create` | F06-FAILED-PAYMENT | FP/BF | `interaction-state-matrix.md` / PLANNED |
| PAY-03 | P0 | 微信支付回调验签、双重幂等和入账 | SYSTEM-PAYMENT | F06 | `ingestWechatPaymentCallback` | PaymentCallback | `system.wechat.callback` | F06-IDEMPOTENT | BX/BF | `interaction-state-matrix.md` / PLANNED |
| PAY-04 | P0 | 全额/部分退款和原支付余额约束 | OPS-REFUNDS | F06 | `createPaymentRefund` | PaymentRefund | `payment.refund` | PAY-PROP-04 | FW/BF | `product-spec.md` / PLANNED |
| PAY-05 | P0 | 微信账单对账、金额异常隔离和人工处理 | OPS-PAYMENT-RECON | F06 | `reconcilePayments` | PaymentReconciliation | `payment.reconcile` | PAY-INT-05 | FW/BX | `scope-decisions.md` / PLANNED |
| RPT-01 | P0 | 票量、收入、成本、毛利和服务质量钻取 | OPS-REPORTS | — | `queryBusinessReport` | ReportResult | `report.business.read` | RPT-RECON-01 | FW/BX | `page-matrix.md` / PLANNED |
| RPT-02 | P0 | 账龄、现金、未核销和利润与明细对账 | OPS-FIN-REPORTS | — | `queryFinanceReport` | ReportResult | `report.finance.read` | RPT-RECON-02 | FW/BX | `page-matrix.md` / PLANNED |
| DOC-01 | P0 | 面单、账单、箱单、发票和交接单模板版本 | OPS-TEMPLATES | — | `publishDocumentTemplate` | DocumentTemplate | `document.template.publish` | DOC-GOLD-01 | FO/BX | `page-matrix.md` / PLANNED |
| DOC-02 | P0 | 字段、格式、脱敏和异步导出审计 | OPS-EXPORTS | — | `createExportJob` | ExportJob | `document.export` | DOC-SEC-02 | FO/BX | `app-shell-spec.md` / PLANNED |
| AUTO-01 | P0 | 事件、条件、动作、命中模拟和发布 | OPS-AUTOMATIONS | — | `simulateAutomation` / `publishAutomation` | AutomationRule | `automation.publish` | AUTO-PROP-01 | FO/BX | `product-spec.md` / PLANNED |
| AUTO-02 | P0 | 执行记录、退避重试、补偿和人工重放 | OPS-AUTO-RUNS | F05/F10 | `replayAutomationRun` | AutomationRun | `automation.replay` | AUTO-INT-02 | FO/BX | `interaction-state-matrix.md` / PLANNED |
| AUTO-03 | P0 | 循环保护、风险策略和关键动作审批 | OPS-AUTO-POLICY | F10 | `approveAiAction` | Approval | `automation.approve` | F10-FORBIDDEN | FO/BX | `interaction-state-matrix.md` / PLANNED |
| NTF-01 | P0 | 站内、邮件、企业微信、Webhook 和模板 | OPS-NOTIFICATIONS | F05 | `publishNotificationTemplate` | NotificationTemplate | `notification.template.write` | NTF-INT-01 | FW/BT | `scope-decisions.md` / PLANNED |
| NTF-02 | P0 | 通知去重、退避、失败查看和重试 | OPS-NOTIFICATION-RUNS | F03/F05 | `retryNotificationDelivery` | NotificationDelivery | `notification.retry` | F05-PARTIAL-NOTIFY | FW/BT | `interaction-state-matrix.md` / PLANNED |
| INT-01 | P0 | OpenAPI 客户端、作用域、限流和密钥轮换 | OPS-API-CLIENTS | — | `createApiClient` / `rotateApiClientSecret` | ApiClient | `integration.api.manage` | INT-SEC-01 | FO/BX | `system-architecture.md` / PLANNED |
| INT-02 | P0 | Webhook 签名、重放保护、死信和重放 | OPS-WEBHOOKS | — | `createWebhookEndpoint` / `replayWebhookDelivery` | WebhookEndpoint | `integration.webhook.manage` | INT-CONTRACT-02 | FO/BX | `system-architecture.md` / PLANNED |
| INT-03 | P0 | UPS、DHL、Amazon、企微和微信支付适配 | OPS-CONNECTORS | F02/F05/F06 | `testConnector` / `syncConnector` | Connector | `integration.connector.manage` | INT-SANDBOX-03 | FO/BX | `scope-decisions.md` / PLANNED |
| INT-04 | P0 | 凭据加密、字段映射、健康、日志和状态对账 | OPS-CONNECTOR-DETAIL | — | `updateConnectorMapping` / `reconcileConnector` | ConnectorMapping | `integration.connector.manage` | INT-SEC-04 | FO/BX | `product-spec.md` / PLANNED |
| INT-05 | P1 | Temu、TikTok Shop 和 SHEIN 官方连接器 | OPS-CONNECTORS | — | `testConnector` | Connector | `integration.connector.manage` | INT-SANDBOX-05 | FO/BX | `scope-decisions.md` / PLANNED |
| AI-01 | P0 | Excel 字段映射建议、证据和置信度 | OPS-ORDER-IMPORT | F10 | `proposeAiMapping` | AiMappingProposal | `ai.mapping.propose` | F10-LOW-CONFIDENCE | FO/BX | `interaction-state-matrix.md` / PLANNED |
| AI-02 | P0 | 报价解释的模型、依据和规则版本 | OPS-QUOTE-DETAIL | F02 | `explainQuoteWithAi` | AiExplanation | `ai.explain` | AI-GROUND-02 | FO/BX | `product-spec.md` / PLANNED |
| AI-03 | P0 | 异常分类和客服草稿，不越过字段权限 | OPS-ISSUES | F05 | `classifyIssueWithAi` / `draftCustomerReply` | AiSuggestion | `ai.suggest` | AI-SEC-03 | FW/BX | `product-spec.md` / PLANNED |
| AI-04 | P0 | 策略内自动应用、关键审批、撤销和审计 | OPS-AI-APPROVAL | F10 | `requestAiApproval` / `approveAiAction` / `rollbackAiAction` | AiAction | `ai.approve` | F10-ROLLBACK | FO/BX | `interaction-state-matrix.md` / PLANNED |
| CUS-01 | P0 | 工作台、查价、下单、导入、运单和轨迹 | CUS-HOME | F01/F02/F05 | `getCustomerDashboard` | CustomerDashboard | `customer.portal.use` | CUS-E2E-01 | FP/BR | `page-matrix.md` / PLANNED |
| CUS-02 | P0 | 账单、预存款、支付、退款和发票申请 | CUS-FINANCE | F06 | `getCustomerFinanceSummary` | CustomerFinanceSummary | `customer.finance.read` | CUS-E2E-02 | FP/BF | `scope-decisions.md` / PLANNED |
| CUS-03 | P0 | 工单、联系人/地址簿、API 申请和安全 | CUS-SETTINGS | F03 | `createApiAccessRequest` | ApiAccessRequest | `customer.settings.write` | CUS-SCOPE-03 | FP/BI | `page-matrix.md` / PLANNED |
| WEB-01 | P0 | 品牌首页、能力、安全、部署和登录入口 | WEB-HOME | — | — | StaticPage | `public` | WEB-VIS-01 | FP | `concept-inventory.md` / PLANNED |
| WEB-02 | P0 | 响应式、SEO、结构化数据和可访问性 | WEB-ALL | — | — | SeoMetadata | `public` | WEB-A11Y-02 | FP | `design-system.md` / PLANNED |
| WEB-03 | P0 | 隐私、条款、许可证版本和运行时年份 | WEB-LEGAL | — | `getPublishedLegalDocument` | LegalDocument | `public` | WEB-E2E-03 | FP/BI | `scope-decisions.md` / PLANNED |
| OPS-01 | P0 | 健康、指标、日志、追踪和队列可见性 | PLT-HEALTH | — | `getSystemHealth` | SystemHealth | `platform.health.read` | OPS-INT-01 | FP/BX | `system-architecture.md` / PLANNED |
| OPS-02 | P0 | 备份、恢复、恢复演练和审计 | PLT-RECOVERY | — | `createRecoveryDrill` | RecoveryDrill | `platform.recovery.manage` | OPS-DRILL-02 | FP/BX | `implementation-roadmap.md` / PLANNED |
| OPS-03 | P0 | 全量/增量迁移、校验、切换和回滚窗口 | OPS-MIGRATION | — | `createMigrationRun` / `commitMigrationCutover` | MigrationRun | `migration.manage` | OPS-DRILL-03 | FO/BX | `scope-decisions.md` / PLANNED |
