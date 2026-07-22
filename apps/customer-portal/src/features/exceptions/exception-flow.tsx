import { useState } from 'react';
import { Button } from '@zhili/ui';
import { customerPort } from '../../api';
import { SummaryItem, SummaryList, WorkflowShell, type WorkflowTone } from '../workflow-shell';

type ExceptionStep = 'list' | 'detail' | 'upload' | 'partial' | 'failed' | 'resolved';

const meta: Record<
  ExceptionStep,
  { title: string; description: string; active: number; tone: WorkflowTone; status: string }
> = {
  list: {
    title: '待处理物流异常',
    description: '按 SLA 与影响范围排序。',
    active: 0,
    tone: 'warning',
    status: '正常 · 4 个异常等待客户处理',
  },
  detail: {
    title: '收件地址无法定位',
    description: '承运商需要补充园区入口与联系人信息。',
    active: 1,
    tone: 'warning',
    status: '待处理 · SLA 剩余 01:26:18',
  },
  upload: {
    title: '提交异常处理资料',
    description: '支持图片、PDF 与现场联系人信息。',
    active: 2,
    tone: 'info',
    status: '正常 · 文件将进行病毒扫描',
  },
  partial: {
    title: '资料已提交，通知部分失败',
    description: '异常单已更新，不影响承运商继续处理。',
    active: 3,
    tone: 'warning',
    status: 'PARTIAL · 3 / 4 个通知渠道成功',
  },
  failed: {
    title: '资料暂未提交',
    description: '附件校验失败，已保留文字信息。',
    active: 2,
    tone: 'danger',
    status: '失败 · 未向承运商发送任何资料',
  },
  resolved: {
    title: '异常已恢复流转',
    description: '承运商确认收到入口信息并重新派送。',
    active: 3,
    tone: 'success',
    status: '成功 · 异常已关闭',
  },
};

export function ExceptionFlow({ notify }: { notify: (message: string) => void }) {
  const [step, setStep] = useState<ExceptionStep>('list');
  const [file, setFile] = useState<File | null>(null);
  const [retryComplete, setRetryComplete] = useState(false);
  const [busy, setBusy] = useState(false);
  const current = meta[step];

  const submitEvidence = async () => {
    if (!file) return;
    setBusy(true);
    try {
      await customerPort.createTicket('补充异常资料：东门货运通道 B3');
      setStep('partial');
      notify('异常资料已保存；短信通知失败，工单不回滚。');
    } catch (error) {
      notify(error instanceof Error ? error.message : '资料提交失败。');
      setStep('failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <WorkflowShell
      code="F03 · 异常中心"
      title={current.title}
      description={current.description}
      steps={['异常列表', '核验详情', '补充资料', '处理完成']}
      activeStep={current.active}
      panelTitle={step === 'list' ? '优先处理' : step === 'partial' ? '通知通道' : '异常资料'}
      status={current.status}
      tone={current.tone}
      summaryTitle={step === 'partial' ? '数据结果' : 'SLA 与处理结果'}
      summary={
        <SummaryList>
          {step === 'partial' ? (
            <>
              <SummaryItem label="异常资料" value="已保存" />
              <SummaryItem label="工单状态" value="处理中" />
              <SummaryItem label="失败渠道" value="短信" />
            </>
          ) : (
            <>
              <SummaryItem label="异常单号" value="EXC-24118" />
              <SummaryItem label="关联运单" value="SHP-20260721-902" />
              <SummaryItem label="审计编号" value="AUD-88420" />
            </>
          )}
        </SummaryList>
      }
      actions={
        <>
          {step === 'list' ? <Button onClick={() => setStep('detail')}>查看详情</Button> : null}
          {step === 'detail' ? <Button onClick={() => setStep('upload')}>补充资料</Button> : null}
          {step === 'upload' ? (
            <>
              <Button variant="secondary" onClick={() => setStep('failed')}>
                模拟上传失败
              </Button>
              <Button disabled={!file || busy} onClick={() => void submitEvidence()}>
                {busy ? '提交中…' : '提交资料'}
              </Button>
            </>
          ) : null}
          {step === 'partial' ? (
            <>
              <Button
                variant="secondary"
                disabled={busy || retryComplete}
                onClick={() => {
                  setBusy(true);
                  void customerPort
                    .retryFailedNotifications(['notification-sms'])
                    .then(() => {
                      setRetryComplete(true);
                      notify('仅重试失败通知：客户短信已送达。');
                    })
                    .finally(() => setBusy(false));
                }}
              >
                仅重试失败通知
              </Button>
              <Button onClick={() => setStep('resolved')}>继续处理</Button>
            </>
          ) : null}
          {step === 'failed' ? <Button onClick={() => setStep('upload')}>重新上传</Button> : null}
          {step === 'resolved' ? (
            <Button onClick={() => setStep('list')}>返回异常列表</Button>
          ) : null}
        </>
      }
    >
      {step === 'list' ? (
        <div>
          <div className="customer-workflow__choice-list">
            <button onClick={() => setStep('detail')}>
              <strong>EXC-24118 · 收件地址无法定位</strong>
              <span>SLA 剩余 1h 26m · 高影响</span>
            </button>
            <button>
              <strong>EXC-24109 · 破损证明缺失</strong>
              <span>SLA 剩余 3h 10m</span>
            </button>
            <button>
              <strong>EXC-24087 · 温控记录异常</strong>
              <span>SLA 剩余 5h 42m</span>
            </button>
            <button>
              <strong>EXC-24062 · 签收人信息不全</strong>
              <span>SLA 剩余 8h 05m</span>
            </button>
          </div>
          <form
            className="customer-workflow__quick-ticket"
            onSubmit={(event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              void customerPort
                .createTicket(String(form.get('description') ?? '轨迹问题'))
                .then(() => notify('工单已创建，通知发送失败；工单不回滚，可仅重试通知。'))
                .catch((error: Error) => notify(error.message));
            }}
          >
            <label>
              问题描述
              <textarea name="description" aria-label="问题描述" required />
            </label>
            <Button type="submit">提交工单</Button>
          </form>
        </div>
      ) : step === 'detail' ? (
        <div className="customer-workflow__choice-list">
          <div>
            <strong>最新轨迹 · 北京望京站 / 10:42</strong>
            <span>导航无法定位园区入口</span>
          </div>
          <div>
            <strong>园区入口照片 · 必需</strong>
            <span>用于承运商重新导航</span>
          </div>
          <div>
            <strong>现场联系人 · 李楠</strong>
            <span>139****8712</span>
          </div>
        </div>
      ) : step === 'upload' ? (
        <div className="customer-workflow__form">
          <label>
            入口照片
            <input
              aria-label="入口照片"
              type="file"
              accept="image/*,.pdf"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            />
          </label>
          <label>
            现场联系人
            <input defaultValue="李楠 139****8712" />
          </label>
          <label>
            位置说明
            <textarea defaultValue="东门货运通道 B3" />
          </label>
          {file ? <p>待提交：{file.name}</p> : null}
        </div>
      ) : step === 'partial' ? (
        <div className="customer-workflow__choice-list">
          <div>
            <strong>承运商 API · 成功</strong>
            <span>14:42:08</span>
          </div>
          <div>
            <strong>企业微信 · 成功</strong>
            <span>14:42:09</span>
          </div>
          <div data-danger="true">
            <strong>客户短信 · 失败</strong>
            <span>号码拒收</span>
          </div>
          <div>
            <strong>站内消息 · 成功</strong>
            <span>14:42:10</span>
          </div>
          {retryComplete ? (
            <p className="customer-workflow__success-message">所有通知渠道已送达</p>
          ) : null}
        </div>
      ) : (
        <div className="customer-workflow__result">
          <strong>{current.status}</strong>
          <p>{current.description}</p>
        </div>
      )}
    </WorkflowShell>
  );
}
