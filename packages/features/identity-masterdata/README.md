# 身份、租户、组织、客户与权限

本包按 `model/application/adapters/ui/worker/test` 拆分，每个独立功能再使用单独子目录。当前只建立稳定工作区入口；对应前端工作树必须以测试先行补齐真实交互、契约 Mock、权限与异常态。

禁止直接导入其他领域包内部文件；跨域 DTO 来自 `@zhili/contracts`，跨域行为使用公开端口或事件。
