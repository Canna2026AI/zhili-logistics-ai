# SaaS 平台端

平台管理员的租户、角色、字段策略、授权模拟、配额与审计入口。端内板块位于
`src/features/<feature>`，权威命令适配位于 `src/api.ts`。

```bash
pnpm --filter @zhili/platform dev
pnpm --filter @zhili/platform test
pnpm --filter @zhili/platform lint
pnpm --filter @zhili/platform typecheck
pnpm --filter @zhili/platform build
pnpm exec playwright test --project=platform
```

交互演示访问 `http://127.0.0.1:4103/?mock=1`。角色、字段权限和模拟登录均要求版本、
理由、租户与审计回执匹配。
