# 客户门户

客户企业边界内的查价下单、轨迹、账单付款、异常资料和账户设置。端内流程位于
`src/features/<feature>`，`src/api.ts` 是当前端的权威传输适配层。

```bash
pnpm --filter @zhili/customer-portal dev
pnpm --filter @zhili/customer-portal test
pnpm --filter @zhili/customer-portal lint
pnpm --filter @zhili/customer-portal typecheck
pnpm --filter @zhili/customer-portal build
pnpm exec playwright test --project=customer
```

交互演示访问 `http://127.0.0.1:4101/?mock=1`。付款、核销和资料上传的逻辑意图会
持久化幂等键，页面重载后继续恢复同一次操作。
