# Android 壳

PDA 以同一套离线优先 Web 代码构建 PWA 与 Capacitor Android 壳。

```bash
pnpm build
pnpm cap:add:android   # 首次生成 android/，由团队决定是否提交原生工程
pnpm cap:sync
pnpm cap:open:android
```

生产环境 API 固定使用同源 `/api/v1`；原生壳需在发布环境通过安全反向代理提供该路径。不要把认证 Cookie、API 响应或离线业务明文放入原生偏好存储。
