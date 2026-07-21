# Pull Request 检查清单

## 变更范围 / Scope

说明本 PR 负责的功能 ID、端、目录与不在范围内的内容。

## 契约与迁移 / Contract and migration

- [ ] 未修改共享契约或迁移
- [ ] 已先由 owner 合入 OpenAPI/数据库迁移，再消费新版本
- [ ] 幂等、版本、权限、审计与租户边界已覆盖

## 测试证据 / Verification

- [ ] 先观察到正确的失败测试
- [ ] `pnpm lint`
- [ ] `pnpm typecheck`
- [ ] `pnpm test`
- [ ] `pnpm build`
- [ ] 相关 Playwright、视觉和可访问性证据已附上

## UI 一致性 / Fidelity

列出对照概念图、画布尺寸、至少五个核对点及仍存在的有意偏差。

## 风险与回滚 / Risk and rollback

说明数据、财务、权限、外部连接器和发布回滚方式。
