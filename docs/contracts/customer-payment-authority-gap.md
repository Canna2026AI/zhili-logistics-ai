# Customer payment authority contract gap

The current `PaymentOrder` OpenAPI response exposes the order ID, order number, purpose, status, amount, paid amount, refunded amount, and version. It does not expose `customerId`, `statementId`, or `statementVersion`.

The customer portal therefore uses a strongly typed selected billing record to carry `customerId`, `receiptId`, `statementId`, `statementVersion`, amount, and currency into the payment request and persisted logical intent. On restoration it validates that this intent still matches a record available inside the current customer boundary, then validates every PaymentOrder field available from the server before showing financial state. It also fetches the authoritative allocation snapshot after a successful payment.

This prevents a cached record from silently changing the selected customer, statement, receipt, amount, currency, or version, but it cannot prove from the current PaymentOrder response alone that the server order belongs to the expected statement and customer. The backend contract should add these three correlation fields to `PaymentOrder`, or provide an authoritative statement-payment lookup returning them. Once available, the runtime validator must compare them directly with the persisted intent before any PENDING, partial, or conflict state is displayed.
