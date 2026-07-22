import { useState } from 'react';
import { Button } from '@zhili/ui';

export type OperationsPageName = '系统健康' | '任务与队列' | '审计日志' | '版本发布';

const configurations: Record<
  OperationsPageName,
  {
    description: string;
    action: string;
    metrics: Array<[string, string, string]>;
    columns: string[];
    rows: string[][];
  }
> = {
  系统健康: {
    description: '服务、数据库与第三方集成的实时运行状态',
    action: '运行健康检查',
    metrics: [
      ['核心服务', '24 / 24', '全部在线'],
      ['API P95', '182 ms', '过去 15 分钟'],
      ['错误率', '0.08%', '低于阈值'],
      ['待处理告警', '2', '1 项需关注'],
    ],
    columns: ['服务', '实例', '延迟 / 负载', '最近检查', '状态'],
    rows: [
      ['API Gateway', '6 / 6', '168 ms · 42%', '14:21:08', '健康'],
      ['Order Service', '8 / 8', '202 ms · 58%', '14:21:07', '健康'],
      ['Warehouse Service', '4 / 4', '311 ms · 66%', '14:21:05', '健康'],
      ['Billing Service', '3 / 3', '286 ms · 71%', '14:21:04', '需关注'],
    ],
  },
  任务与队列: {
    description: '异步任务、重试与死信队列的统一调度入口',
    action: '新建调度任务',
    metrics: [
      ['运行中', '38', '跨 6 个队列'],
      ['等待中', '214', '峰值 480'],
      ['失败重试', '7', '自动退避'],
      ['吞吐', '1,284 /m', '过去 5 分钟'],
    ],
    columns: ['队列', '运行 / 等待', '吞吐', '最旧任务', '状态'],
    rows: [
      ['shipment.events', '12 / 86', '462 /m', '18 秒', '运行中'],
      ['warehouse.scan', '8 / 64', '318 /m', '42 秒', '运行中'],
      ['billing.invoice', '5 / 28', '126 /m', '31 秒', '等待'],
      ['notification.send', '4 / 24', '84 /m', '27 秒', '失败重试'],
    ],
  },
  审计日志: {
    description: '查询高风险操作、权限变更与代入会话证据',
    action: '导出审计证据',
    metrics: [
      ['今日事件', '18,426', '写入正常'],
      ['高风险', '23', '已复核 19'],
      ['代入事件', '7', '均已结束'],
      ['保留周期', '365 天', '不可篡改'],
    ],
    columns: ['时间 / 事件', '操作者', '对象', '来源', '结果'],
    rows: [
      ['14:18:32 · ACL 撤权', '安全管理员', '运营管理员', '172.16.8.21', '成功'],
      ['14:11:06 · 代入结束', '系统管理员', '李明', '172.16.4.92', '成功'],
      ['14:03:18 · 策略发布', '平台管理员', '权限 v19', '172.16.4.16', '成功'],
      ['13:58:42 · 策略验证', '平台管理员', '权限 v19', '172.16.4.16', '失败'],
    ],
  },
  版本发布: {
    description: '管理平台版本、灰度范围、回滚点与发布审批',
    action: '创建发布计划',
    metrics: [
      ['当前版本', 'v2.8.4', '生产环境'],
      ['灰度版本', 'v2.9.0-rc3', '20% 租户'],
      ['待审批', '3', '含 1 个高风险'],
      ['可回滚点', '5', '最近 30 天'],
    ],
    columns: ['版本', '环境 / 范围', '发布时间', '发布人', '状态'],
    rows: [
      ['v2.9.0-rc3', '灰度 · 20%', '07-23 13:30', '陈晨', '灰度中'],
      ['v2.8.4', '生产 · 100%', '07-18 22:10', '王凯', '稳定'],
      ['v2.8.3', '生产 · 已归档', '07-04 21:42', '王凯', '可回滚'],
      ['v2.8.5-hotfix', '待审批', '计划 07-23 23:00', '李海', '等待审批'],
    ],
  },
};

export function OperationsPage({ page }: { page: OperationsPageName }) {
  const [forbidden, setForbidden] = useState(false);
  const config = configurations[page];
  if (forbidden)
    return (
      <section className="f08-operation-forbidden" role="region" aria-label="禁止访问">
        <div className="f08-result-icon">!</div>
        <small>FORBIDDEN</small>
        <h1>无权执行此操作</h1>
        <p>
          当前角色缺少 <code>platform.release.publish</code>，发布计划未被创建。
        </p>
        <div className="f08-result-detail">请求编号 ZL-ACL-0723-019 · 可由超级管理员审批授权</div>
        <Button onClick={() => setForbidden(false)}>返回版本列表</Button>
      </section>
    );
  return (
    <>
      <div className="platform-heading">
        <div>
          <h1>{page}</h1>
          <p>{config.description}</p>
        </div>
        <Button onClick={() => (page === '版本发布' ? setForbidden(true) : undefined)}>
          {config.action}
        </Button>
      </div>
      <section className="f08-operation-metrics">
        {config.metrics.map(([label, value, hint]) => (
          <article key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
            <small>{hint}</small>
          </article>
        ))}
      </section>
      <div className="f08-operation-health">
        {page === '版本发布'
          ? '生产 v2.8.4 运行稳定 · 灰度错误率 0.11%'
          : '所有核心链路正常 · 最近检查 14:21:08'}
      </div>
      <div className="platform-table-wrap">
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
