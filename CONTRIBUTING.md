# 参与智立科技物流AI系统开发

## 环境

- Node.js 22.22–24.x，本地基线为 `.nvmrc`，CI 使用 Node 24。
- pnpm 11.5.0；执行 `corepack enable` 后使用 `pnpm install --frozen-lockfile`。
- 浏览器验收需要 Chromium：`pnpm exec playwright install chromium`。

## 分支与工作树

分支统一使用 `codex/<domain>`；工作树放在被 Git 忽略的 `.worktrees/<domain>`。同时最多三个实现工作树，共享契约、设计令牌、UI 包和数据库迁移由 CODEOWNERS 负责。

一个功能应放在独立目录，并包含视图、状态、API 适配和测试。跨功能依赖只能通过 `@zhili/contracts`、共享 UI 或明确的领域端口，不直接导入另一功能的内部文件。

公开仓库参与者可以 Fork 后提交 PR；受邀协作者从 `main` 创建
`codex/<surface>-<feature>` 分支。不要直接向 `main` 推送功能提交。一个 PR 只负责
一个端或一个共享领域，目录映射与局部验收命令见
[`docs/02-architecture/module-collaboration.md`](docs/02-architecture/module-collaboration.md)。

## 测试先行

每个生产行为先增加失败测试并确认失败原因正确，再写最小实现。提交前至少运行：

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm e2e
```

财务、状态迁移、权限、RLS、幂等、外部回调和 AI 自动动作必须包含负例。前端变更必须附固定画布截图与概念图对照记录。

只修改单端时，先运行该端的 `test`、`lint`、`typecheck`、`build` 与对应
Playwright project；合并前再运行全仓门禁。共享 OpenAPI 发生变化时还必须运行
`pnpm contracts:lint`、`pnpm contracts:test` 和 `pnpm contracts:generate:check`。

## 提交与评审

提交使用 Conventional Commits；PR 标题中英双语。PR 必须写明功能 ID、数据边界、契约变化、测试证据、视觉差异和回滚方式。不要提交密钥、真实客户数据、第三方商标素材或 T6 的专有源码与文案。
