import { useState } from 'react';
import { Button } from '@zhili/ui';
import { customerPort } from '../../api';
import { SummaryItem, SummaryList, WorkflowShell, type WorkflowTone } from '../workflow-shell';

type TrackingStep = 'stale' | 'create' | 'created' | 'close' | 'forbidden' | 'closed';

const meta: Record<
  TrackingStep,
  { title: string; description: string; active: number; tone: WorkflowTone; status: string }
> = {
  stale: {
    title: '轨迹长时间未更新',
    description: '运单已停滞 26 小时，超过线路阈值。',
    active: 0,
    tone: 'warning',
    status: 'STALE · 超过线路阈值 18 小时',
  },
  create: {
    title: '发起轨迹停滞工单',
    description: '系统已带入运单与异常轨迹。',
    active: 1,
    tone: 'info',
    status: '正常 · 预计 2 小时内首次响应',
  },
  created: {
    title: '客服已接收问题',
    description: '工单已进入高优先级队列。',
    active: 2,
    tone: 'success',
    status: '处理中 · 预计 18:00 前更新轨迹',
  },
  close: {
    title: '确认问题是否解决',
    description: '最新轨迹显示车辆已离开济南分拨中心。',
    active: 3,
    tone: 'info',
    status: '正常 · 关闭后 24 小时内可重开',
  },
  forbidden: {
    title: '无法关闭该工单',
    description: '仅创建人、管理员或客服负责人可以关闭。',
    active: 3,
    tone: 'danger',
    status: '权限不足 · 本次关闭已拦截',
  },
  closed: {
    title: '轨迹问题已解决',
    description: '工单与关联异常均已关闭。',
    active: 3,
    tone: 'success',
    status: '成功 · 工单 TKT-20260723-086 已关闭',
  },
};

export function TrackingFlow({
  waybillNo,
  notify,
}: {
  waybillNo: string;
  notify: (message: string) => void;
}) {
  const [step, setStep] = useState<TrackingStep>('stale');
  const [busy, setBusy] = useState(false);
  const current = meta[step];
  const submit = async () => {
    setBusy(true);
    try {
      await customerPort.createTicket('轨迹停滞：请核实下一程装车时间');
      setStep('created');
      notify('工单 TKT-20260723-086 已创建。');
    } catch (error) {
      notify(error instanceof Error ? error.message : '工单创建失败。');
    } finally {
      setBusy(false);
    }
  };

  return (
    <WorkflowShell
      code="F05 · 物流追踪"
      title={current.title}
      description={`${waybillNo} · ${current.description}`}
      steps={['轨迹诊断', '创建工单', '客服处理', '关闭工单']}
      activeStep={current.active}
      panelTitle={step === 'create' ? '工单内容' : step === 'closed' ? '处理总结' : '运单轨迹'}
      status={current.status}
      tone={current.tone}
      summaryTitle="风险与工单信息"
      summary={
        <SummaryList>
          <SummaryItem label="预计延误" value="1 天" />
          <SummaryItem label="优先级" value="高" />
          <SummaryItem label="负责人" value="周宁" />
        </SummaryList>
      }
      actions={
        <>
          {step === 'stale' ? <Button onClick={() => setStep('create')}>创建工单</Button> : null}
          {step === 'create' ? (
            <Button disabled={busy} onClick={() => void submit()}>
              {busy ? '提交中…' : '提交工单'}
            </Button>
          ) : null}
          {step === 'created' ? <Button onClick={() => setStep('close')}>准备关闭</Button> : null}
          {step === 'close' ? (
            <>
              <Button variant="secondary" onClick={() => setStep('forbidden')}>
                模拟无权限
              </Button>
              <Button onClick={() => setStep('closed')}>确认关闭</Button>
            </>
          ) : null}
          {step === 'forbidden' ? <Button onClick={() => setStep('close')}>返回工单</Button> : null}
          {step === 'closed' ? <Button onClick={() => setStep('stale')}>查看追踪</Button> : null}
        </>
      }
    >
      {step === 'create' ? (
        <div className="customer-workflow__form">
          <label>
            关联运单
            <input value={waybillNo} readOnly />
          </label>
          <label>
            问题类型
            <select defaultValue="tracking">
              <option value="tracking">轨迹停滞</option>
            </select>
          </label>
          <label>
            问题描述
            <textarea aria-label="问题描述" defaultValue="请核实下一程装车时间" />
          </label>
        </div>
      ) : step === 'created' || step === 'close' ? (
        <div className="customer-workflow__timeline">
          <strong>TKT-20260723-086</strong>
          <p>
            <time>14:06</time> 工单创建成功
          </p>
          <p>
            <time>14:18</time> 客服确认联系承运商
          </p>
          <p>
            <time>16:08</time> 车辆已离开济南分拨中心
          </p>
        </div>
      ) : step === 'closed' || step === 'forbidden' ? (
        <div className="customer-workflow__result">
          <strong>{current.status}</strong>
          <p>{current.description}</p>
        </div>
      ) : (
        <div className="customer-workflow__timeline">
          <strong>{waybillNo}</strong>
          {waybillNo === 'S2505120006' ? (
            <p>
              <time>刚刚</time> 预报已提交 · 等待仓库收货
            </p>
          ) : (
            <p>
              <time>2026-05-12 08:16</time> 已收货 · 悉尼仓库
            </p>
          )}
          <p>
            <time>2026-05-11 19:20</time> 到达济南分拨中心
          </p>
          <p>
            <time>2026-05-11 12:02</time> 等待下一程装车
          </p>
        </div>
      )}
    </WorkflowShell>
  );
}
