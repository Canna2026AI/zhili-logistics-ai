import { useState } from 'react';
import { Button } from '@zhili/ui';
import { PlatformApiError } from '../../api';

export type OperationsPageName = '系统健康' | '任务与队列' | '审计日志' | '版本发布';
export interface OperationReceipt {
  operationId: string;
  status: 'SUCCEEDED';
  message: string;
}
const configurations: Record<
  OperationsPageName,
  { description: string; action: string; columns: string[]; rows: string[][] }
> = {
  系统健康: {
    description: '服务、数据库与第三方集成的实时运行状态',
    action: '运行健康检查',
    columns: ['服务', '实例', '最近检查', '状态'],
    rows: [
      ['API Gateway', '6 / 6', '服务端回执后更新', '健康'],
      ['Warehouse Service', '4 / 4', '服务端回执后更新', '健康'],
    ],
  },
  任务与队列: {
    description: '异步任务、重试与死信队列的统一调度入口',
    action: '新建调度任务',
    columns: ['队列', '运行 / 等待', '吞吐', '状态'],
    rows: [
      ['shipment.events', '12 / 86', '462 /m', '运行中'],
      ['billing.invoice', '5 / 28', '126 /m', '等待'],
    ],
  },
  审计日志: {
    description: '查询高风险操作、权限变更与代入会话证据',
    action: '导出审计证据',
    columns: ['事件', '操作者', '对象', '结果'],
    rows: [
      ['ACL 撤权', '安全管理员', '运营管理员', '成功'],
      ['策略发布', '平台管理员', '权限策略', '成功'],
    ],
  },
  版本发布: {
    description: '管理平台版本、灰度范围、回滚点与发布审批',
    action: '创建发布计划',
    columns: ['版本', '环境 / 范围', '发布人', '状态'],
    rows: [
      ['v2.9.0-rc3', '灰度 · 20%', '陈晨', '灰度中'],
      ['v2.8.4', '生产 · 100%', '王凯', '稳定'],
    ],
  },
};

export function OperationsPage({
  page,
  onExecute,
}: {
  page: OperationsPageName;
  onExecute: (page: OperationsPageName) => Promise<OperationReceipt>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Error>();
  const [receipt, setReceipt] = useState<OperationReceipt>();
  const config = configurations[page];
  const execute = async () => {
    setBusy(true);
    setError(undefined);
    try {
      setReceipt(await onExecute(page));
    } catch (caught) {
      setError(caught instanceof Error ? caught : new Error('运维操作失败'));
    } finally {
      setBusy(false);
    }
  };
  if (error instanceof PlatformApiError && error.status === 403)
    return (
      <section className="f08-operation-forbidden" role="region" aria-label="禁止访问">
        <div className="f08-result-icon">!</div>
        <small>FORBIDDEN</small>
        <h1>无权执行此操作</h1>
        <p>{error.message}</p>
        <div className="f08-result-detail">服务端拒绝本次操作；未创建任何发布计划。</div>
        <Button onClick={() => setError(undefined)}>返回版本列表</Button>
      </section>
    );
  return (
    <>
      <div className="platform-heading">
        <div>
          <h1>{page}</h1>
          <p>{config.description}</p>
        </div>
        <Button loading={busy} disabled={busy} onClick={() => void execute()}>
          {config.action}
        </Button>
      </div>
      {receipt ? (
        <div role="status">
          {receipt.operationId} · {receipt.status} · {receipt.message}
        </div>
      ) : null}
      {error ? (
        <div className="f08-save-error" role="alert">
          {error.message}
        </div>
      ) : null}
      <div className="platform-table-wrap" tabIndex={0} aria-label={`${page}表格可滚动区域`}>
        <table className="platform-table" aria-label={`${page}列表`}>
          <thead>
            <tr>
              {config.columns.map((column) => (
                <th key={column}>{column}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {config.rows.map((row) => (
              <tr key={row[0]}>
                {row.map((cell, index) => (
                  <td key={`${cell}-${index}`}>{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
