import { useState } from 'react';
import { Button } from '@zhili/ui';
import { customerPort, type OrderInput, type QuoteResult } from '../../api';
import { SummaryItem, SummaryList, WorkflowShell, type WorkflowTone } from '../workflow-shell';

type ShipmentStep = 'details' | 'address' | 'quote' | 'success' | 'stale' | 'failed' | 'forbidden';

type ShipmentFlowProps = {
  selectedQuote: QuoteResult | null;
  draftSaved: boolean;
  now: () => number;
  onDraft: (input: Partial<OrderInput>) => Promise<void>;
  onSubmitted: (input: OrderInput) => Promise<void>;
  onDraftSaved: () => void;
  mockMode?: boolean;
};

const defaultInput: OrderInput = {
  origin: 'CN-SZX 518000',
  recipient: '',
  destination: '',
  phone: '+1 213 555 0108',
  commodity: '服装样品',
  pieces: 18,
  weightKg: 122,
};

const steps = ['基本信息', '地址确认', '选择报价', '提交完成'];

export function ShipmentFlow({
  selectedQuote,
  draftSaved,
  now,
  onDraft,
  onSubmitted,
  onDraftSaved,
  mockMode = false,
}: ShipmentFlowProps) {
  const [step, setStep] = useState<ShipmentStep>('details');
  const [input, setInput] = useState<OrderInput>(() => ({
    ...defaultInput,
    origin: selectedQuote?.request.origin ?? defaultInput.origin,
    acceptedQuote: selectedQuote
      ? {
          quoteId: selectedQuote.id,
          optionId: selectedQuote.optionId,
          version: selectedQuote.version,
        }
      : undefined,
  }));
  const [quote, setQuote] = useState<QuoteResult | null>(selectedQuote);
  const [piecesText, setPiecesText] = useState(String(defaultInput.pieces));
  const [weightText, setWeightText] = useState(String(defaultInput.weightKg));
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');

  const update = (field: keyof OrderInput, value: string | number) =>
    setInput((current) => ({ ...current, [field]: value }));
  const currentInput = (): OrderInput => ({
    ...input,
    pieces: Number(piecesText),
    weightKg: Number(weightText),
  });
  const complete = async (direct = false) => {
    setBusy(true);
    setError('');
    try {
      let accepted = quote;
      if (!direct && accepted && !input.acceptedQuote)
        accepted = await customerPort.acceptQuote(accepted);
      const preparedInput = currentInput();
      const nextInput = accepted
        ? {
            ...preparedInput,
            acceptedQuote: {
              quoteId: accepted.id,
              optionId: accepted.optionId,
              version: accepted.version,
            },
          }
        : preparedInput;
      await onSubmitted(nextInput);
      setInput(nextInput);
      setStep('success');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '运单提交失败，请重试。');
      if (!direct) setStep('failed');
    } finally {
      setBusy(false);
    }
  };
  const searchQuote = async () => {
    setBusy(true);
    setError('');
    try {
      const result = await customerPort.quote(
        {
          origin: input.origin.split(' ')[0] || 'CN-SZX',
          destinationPostalCode: input.destination.match(/\b\d{5,6}\b/)?.[0] ?? '90001',
          weightKg: input.weightKg,
          volumeM3: 0.48,
        },
        now
      );
      setQuote(result);
      setStep(new Date(result.validUntil).getTime() <= now() ? 'stale' : 'quote');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '询价失败，请重试。');
      setStep('failed');
    } finally {
      setBusy(false);
    }
  };

  const meta: Record<
    ShipmentStep,
    {
      code: string;
      title: string;
      description: string;
      active: number;
      tone: WorkflowTone;
      status: string;
    }
  > = {
    details: {
      code: copied ? 'F01 · 复制运单' : 'F01 · 新建运单',
      title: copied ? '复制历史运单' : '创建物流运单',
      description: copied
        ? '已带入历史运单的可复用信息，请确认后继续。'
        : '填写地址并获取实时承运商报价。',
      active: 0,
      tone: 'primary',
      status: copied ? '正常 · 已复制 8 项字段' : '正常 · 草稿已自动保存',
    },
    address: {
      code: 'F01 · 地址确认',
      title: '选择寄收件地址',
      description: '从企业地址簿选择或添加临时地址。',
      active: 1,
      tone: 'primary',
      status: '正常 · 地址已通过服务范围校验',
    },
    quote: {
      code: 'F01 · 报价结果',
      title: '选择承运商方案',
      description: '报价有效期 15 分钟，提交前将再次校验。',
      active: 2,
      tone: 'success',
      status: '正常 · 已选中智立海运专线',
    },
    success: {
      code: 'F01 · 提交完成',
      title: '运单创建成功',
      description: '承运商已接单，后续节点将自动推送。',
      active: 3,
      tone: 'success',
      status: '成功 · 运单与支付凭证已生成',
    },
    stale: {
      code: 'F01 · 报价已过期',
      title: '报价需要刷新',
      description: '承运商价格已更新，请重新确认后提交。',
      active: 2,
      tone: 'warning',
      status: 'STALE · 报价版本落后于承运商',
    },
    failed: {
      code: 'F01 · 提交失败',
      title: '运单暂未创建',
      description: error || '业务网关暂时不可用，输入已保留。',
      active: 3,
      tone: 'danger',
      status: '失败 · 可安全重试，不会重复下单',
    },
    forbidden: {
      code: 'F01 · 权限限制',
      title: '无法创建运单',
      description: '当前账号缺少 shipment:create 权限。',
      active: 0,
      tone: 'danger',
      status: '权限不足 · 操作已拦截',
    },
  };
  const current = meta[step];

  return (
    <WorkflowShell
      code={current.code}
      title={current.title}
      description={current.description}
      steps={steps}
      activeStep={current.active}
      panelTitle={step === 'quote' ? '可选报价' : step === 'success' ? '运单信息' : '运单信息'}
      status={current.status}
      tone={current.tone}
      summaryTitle={step === 'quote' ? '价格明细' : '操作摘要'}
      summary={
        <SummaryList>
          <SummaryItem label="预计里程" value="1,214 km" />
          <SummaryItem label="预计时效" value="2–3 天" />
          <SummaryItem label="含税金额" value={quote ? `CNY ${quote.charges.total}` : '待询价'} />
        </SummaryList>
      }
      actions={
        <>
          {step === 'details' ? (
            <>
              {mockMode ? (
                <Button variant="secondary" onClick={() => setStep('forbidden')}>
                  模拟无权限
                </Button>
              ) : null}
              <Button
                variant="secondary"
                onClick={() => {
                  setCopied(true);
                  setInput({ ...defaultInput, recipient: '李楠', destination: 'US-LAX 90001' });
                  setPiecesText(String(defaultInput.pieces));
                  setWeightText(String(defaultInput.weightKg));
                }}
              >
                复制已有运单
              </Button>
              <Button onClick={() => setStep('address')}>选择地址</Button>
            </>
          ) : step === 'address' ? (
            <>
              <Button variant="secondary" onClick={() => setStep('details')}>
                上一步
              </Button>
              <Button disabled={busy} onClick={() => void searchQuote()}>
                {busy ? '查询中…' : '查询报价'}
              </Button>
            </>
          ) : step === 'quote' ? (
            <>
              {mockMode ? (
                <>
                  <Button variant="secondary" onClick={() => setStep('stale')}>
                    模拟报价过期
                  </Button>
                  <Button variant="secondary" onClick={() => setStep('failed')}>
                    模拟提交失败
                  </Button>
                </>
              ) : null}
              <Button disabled={busy} onClick={() => void complete()}>
                {busy ? '提交中…' : '提交运单'}
              </Button>
            </>
          ) : step === 'stale' ? (
            <Button onClick={() => void searchQuote()}>刷新报价</Button>
          ) : step === 'failed' ? (
            <Button disabled={busy} onClick={() => void complete(Boolean(input.acceptedQuote))}>
              重新提交
            </Button>
          ) : step === 'forbidden' ? (
            <Button variant="secondary" onClick={() => setStep('details')}>
              返回编辑
            </Button>
          ) : (
            <Button onClick={() => setStep('details')}>复制此运单</Button>
          )}
        </>
      }
    >
      {step === 'details' ? (
        <form
          className="customer-workflow__form"
          onSubmit={(event) => {
            event.preventDefault();
            void complete(true);
          }}
        >
          <h3>新建运单</h3>
          {selectedQuote ? (
            <p className="portal-selected-quote">
              已选择：{selectedQuote.channel} · CNY {selectedQuote.charges.total}
            </p>
          ) : null}
          {draftSaved ? (
            <p className="portal-selected-quote">草稿已保存，可继续编辑后提交。</p>
          ) : null}
          <div className="customer-workflow__field-grid">
            <label>
              发货地
              <input
                aria-label="发货地"
                value={input.origin}
                onChange={(event) => update('origin', event.target.value)}
                required
              />
            </label>
            <label>
              收件人
              <input
                aria-label="收件人"
                value={input.recipient}
                onChange={(event) => update('recipient', event.target.value)}
                required
              />
            </label>
            <label>
              目的地
              <input
                aria-label="目的地"
                value={input.destination}
                onChange={(event) => update('destination', event.target.value)}
                required
              />
            </label>
            <label>
              联系电话
              <input
                aria-label="联系电话"
                value={input.phone}
                onChange={(event) => update('phone', event.target.value)}
              />
            </label>
            <label>
              品名
              <input
                aria-label="品名"
                value={input.commodity}
                onChange={(event) => update('commodity', event.target.value)}
              />
            </label>
            <label>
              件数
              <input
                aria-label="件数"
                value={piecesText}
                inputMode="numeric"
                onChange={(event) => setPiecesText(event.target.value)}
              />
            </label>
            <label>
              预报重（kg）
              <input
                aria-label="预报重（kg）"
                value={weightText}
                inputMode="decimal"
                onChange={(event) => setWeightText(event.target.value)}
              />
            </label>
          </div>
          <div className="customer-workflow__legacy-actions">
            <Button
              variant="secondary"
              type="button"
              onClick={() =>
                void onDraft(currentInput())
                  .then(onDraftSaved)
                  .catch(() => undefined)
              }
            >
              保存草稿
            </Button>
            <Button type="submit">提交预报</Button>
          </div>
        </form>
      ) : step === 'address' ? (
        <div className="customer-workflow__choice-list">
          <button data-selected="true">
            <strong>发件 · 上海虹桥仓</strong>
            <span>{input.origin}</span>
          </button>
          <button data-selected="true">
            <strong>收件 · 北京望京站</strong>
            <span>{input.destination || 'US-LAX 90001 · 李楠'}</span>
          </button>
          <button>
            <strong>上门时间</strong>
            <span>07-24 09:00–12:00</span>
          </button>
        </div>
      ) : step === 'quote' && quote ? (
        <div className="customer-workflow__choice-list">
          <button data-selected="true">
            <strong>推荐 · {quote.channel}</strong>
            <span>2 天 · CNY {quote.charges.total}</span>
          </button>
          <button>
            <strong>经济 · 中通快运</strong>
            <span>3 天 · CNY 4,980.00</span>
          </button>
          <button>
            <strong>加急 · 跨越速运</strong>
            <span>次日 · CNY 6,260.00</span>
          </button>
        </div>
      ) : step === 'success' ? (
        <div className="customer-workflow__result">
          <strong>S2505120006</strong>
          <p>承运商 · 智立海运专线</p>
          <p>预计提货 · 07-24 10:30</p>
          <p>物流追踪已自动开启</p>
        </div>
      ) : (
        <div className="customer-workflow__result">
          <strong>{current.status}</strong>
          <p>{current.description}</p>
          <p>所有输入和幂等请求号均已保留。</p>
        </div>
      )}
    </WorkflowShell>
  );
}
