# PDA

仓库与尾程设备端，覆盖绑定、任务、扫码、离线队列、媒体、冲突处理、设备接管和
签收。持久化适配位于 `src/offline`，设备端口位于 `src/ports`，业务流程按目录拆分。

```bash
pnpm --filter @zhili/pda dev
pnpm --filter @zhili/pda test
pnpm --filter @zhili/pda lint
pnpm --filter @zhili/pda typecheck
pnpm --filter @zhili/pda build
pnpm exec playwright test --project=pda
```

交互演示访问 `http://127.0.0.1:4102/?mock=1`。不带参数时使用真实同源 API；离线
事件只有在服务端回执身份、作用域和版本全部匹配后才会清理。
