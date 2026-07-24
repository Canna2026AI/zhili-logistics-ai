# 运营端

内部操作员的统一工作台。页面装配位于 `src/app.tsx`，每个业务板块位于
`src/features/<feature>`；跨端可复用的报价、运单和仓配规则位于
`packages/features`。

```bash
pnpm --filter @zhili/ops dev
pnpm --filter @zhili/ops test
pnpm --filter @zhili/ops lint
pnpm --filter @zhili/ops typecheck
pnpm --filter @zhili/ops build
pnpm exec playwright test --project=ops
```

交互演示访问 `http://127.0.0.1:4100/?mock=1`。不带 `mock=1` 时使用真实 API，
409/410/412/422 等业务错误必须进入显式恢复流程。
