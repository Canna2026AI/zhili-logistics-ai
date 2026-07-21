# Worker 应用占位

后端阶段在此建立 BullMQ Worker 入口，处理导入、打印、通知、轨迹、连接器、AI、报表和事务 Outbox。每类任务的业务处理器属于对应 `packages/features/*/worker`，本目录只负责队列装配、重试、死信、追踪与优雅停机。
