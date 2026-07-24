# 官网

智立科技物流AI系统的公开品牌、产品预览、登录入口和法律页面。官网不承载业务写
操作；事实数据和产品预览集中在 `src/api.ts`，页面装配位于 `src/app.tsx`。

```bash
pnpm --filter @zhili/website dev
pnpm --filter @zhili/website test
pnpm --filter @zhili/website lint
pnpm --filter @zhili/website typecheck
pnpm --filter @zhili/website build
pnpm exec playwright test --project=website
```

本地入口为 `http://127.0.0.1:4104/zhili-logistics-ai/`；法律页与未知静态路由必须
保持可预测的独立响应。
