import { Button, StatusTag } from '@zhili/ui';
import { useMemo, useState } from 'react';
import {
  calculateQuote,
  formatMoney,
  memoryQuotePort,
  quoteInputFixture,
  type QuoteExplanationView,
  type CalculatedQuote,
  type QuotePort,
  type QuoteWorkflowRequest,
} from '../model/quote';
import './quote-workbench.css';

export type QuoteViewState =
  'normal' | 'loading' | 'empty' | 'failed' | 'forbidden' | 'expired' | 'forbidden-cost' | 'stale';

export interface QuoteWorkbenchProps {
  state?: QuoteViewState;
  port?: QuotePort;
  readOnly?: boolean;
  onSubmitForecast?: () => void | Promise<void>;
  draft?: QuoteWorkflowRequest;
  onDraftChange?: (draft: QuoteWorkflowRequest) => void;
  snapshot?: CalculatedQuote;
  onSnapshotChange?: (snapshot: CalculatedQuote) => void;
}

interface QuoteFormState {
  customerId: string;
  orderType: 'STANDARD' | 'FBA';
  currency: string;
  origin: {
    countryCode: string;
    city: string;
    line1: string;
    postalCode: string;
    contactName: string;
    phone: string;
  };
  destination: {
    countryCode: string;
    state: string;
    city: string;
    line1: string;
    postalCode: string;
    contactName: string;
    phone: string;
  };
  pieces: string;
  weightKg: string;
  lengthCm: string;
  widthCm: string;
  heightCm: string;
  commodityDescription: string;
  fbaShipmentId: string;
  fbaBoxCount: string;
  fbaFulfillmentCenter: string;
}

const initialForm: QuoteFormState = {
  customerId: quoteInputFixture.request.customerId,
  orderType: 'STANDARD',
  currency: quoteInputFixture.request.currency,
  origin: {
    countryCode: quoteInputFixture.request.origin.countryCode,
    city: quoteInputFixture.request.origin.city,
    line1: quoteInputFixture.request.origin.line1,
    postalCode: quoteInputFixture.request.origin.postalCode,
    contactName: quoteInputFixture.request.origin.contactName ?? '',
    phone: quoteInputFixture.request.origin.phone ?? '',
  },
  destination: {
    countryCode: quoteInputFixture.request.destination.countryCode,
    state: quoteInputFixture.request.destination.state ?? '',
    city: quoteInputFixture.request.destination.city,
    line1: quoteInputFixture.request.destination.line1,
    postalCode: quoteInputFixture.request.destination.postalCode,
    contactName: quoteInputFixture.request.destination.contactName ?? '',
    phone: quoteInputFixture.request.destination.phone ?? '',
  },
  pieces: '1',
  weightKg: quoteInputFixture.request.packages[0]?.weightKg ?? '0',
  lengthCm: quoteInputFixture.request.packages[0]?.lengthCm ?? '0',
  widthCm: quoteInputFixture.request.packages[0]?.widthCm ?? '0',
  heightCm: quoteInputFixture.request.packages[0]?.heightCm ?? '0',
  commodityDescription: quoteInputFixture.request.packages[0]?.commodityDescription ?? '',
  fbaShipmentId: 'FBA15LAX20260722',
  fbaBoxCount: '5',
  fbaFulfillmentCenter: 'LAX9',
};

function workflowToForm(workflow: QuoteWorkflowRequest): QuoteFormState {
  const firstPackage = workflow.quote.packages[0];
  return {
    ...initialForm,
    customerId: workflow.quote.customerId,
    orderType: workflow.orderContext.orderType,
    currency: workflow.quote.currency,
    origin: {
      ...workflow.quote.origin,
      contactName: workflow.quote.origin.contactName ?? '',
      phone: workflow.quote.origin.phone ?? '',
    },
    destination: {
      ...workflow.quote.destination,
      state: workflow.quote.destination.state ?? '',
      contactName: workflow.quote.destination.contactName ?? '',
      phone: workflow.quote.destination.phone ?? '',
    },
    pieces: String(workflow.quote.packages.length || 1),
    weightKg: firstPackage?.weightKg ?? '0',
    lengthCm: firstPackage?.lengthCm ?? '0',
    widthCm: firstPackage?.widthCm ?? '0',
    heightCm: firstPackage?.heightCm ?? '0',
    commodityDescription: firstPackage?.commodityDescription ?? '',
    fbaShipmentId: workflow.orderContext.fba?.shipmentId ?? initialForm.fbaShipmentId,
    fbaBoxCount: String(workflow.orderContext.fba?.boxCount ?? initialForm.fbaBoxCount),
    fbaFulfillmentCenter:
      workflow.orderContext.fba?.fulfillmentCenter ?? initialForm.fbaFulfillmentCenter,
  };
}

function formToWorkflow(form: QuoteFormState, quoteDate: string): QuoteWorkflowRequest {
  const pieceCount = Math.max(1, Math.floor(Number(form.pieces) || 1));
  return {
    quote: {
      customerId: form.customerId,
      origin: form.origin,
      destination: form.destination,
      packages: Array.from({ length: pieceCount }, (_, index) => ({
        packageRef: `PKG-${String(index + 1).padStart(2, '0')}`,
        weightKg: form.weightKg,
        lengthCm: form.lengthCm,
        widthCm: form.widthCm,
        heightCm: form.heightCm,
        commodityDescription:
          form.orderType === 'FBA'
            ? `Amazon FBA ${form.commodityDescription} / ${form.fbaShipmentId} / ${form.fbaFulfillmentCenter}`
            : form.commodityDescription,
      })),
      quoteDate,
      currency: form.currency,
    },
    orderContext: {
      orderType: form.orderType,
      ...(form.orderType === 'FBA'
        ? {
            fba: {
              shipmentId: form.fbaShipmentId,
              boxCount: Number(form.fbaBoxCount) || 0,
              fulfillmentCenter: form.fbaFulfillmentCenter,
            },
          }
        : {}),
    },
  };
}

export function QuoteWorkbench({
  state = 'normal',
  port = memoryQuotePort,
  readOnly = false,
  onSubmitForecast,
  draft,
  onDraftChange,
  snapshot,
  onSnapshotChange,
}: QuoteWorkbenchProps) {
  const [localForm, setLocalForm] = useState<QuoteFormState>(() =>
    draft ? workflowToForm(draft) : initialForm
  );
  const form = useMemo(() => (draft ? workflowToForm(draft) : localForm), [draft, localForm]);
  const request = useMemo(
    () => formToWorkflow(form, draft?.quote.quoteDate ?? quoteInputFixture.request.quoteDate),
    [draft?.quote.quoteDate, form]
  );
  const [localQuote, setLocalQuote] = useState(() => calculateQuote(quoteInputFixture));
  const quote = snapshot ?? localQuote;
  const quoteKey = `${quote.id}:v${quote.version}`;
  const [dirtySnapshotKey, setDirtySnapshotKey] = useState<string | null>(null);
  const quoteDirty = dirtySnapshotKey === quoteKey;
  const [selectedId, setSelectedId] = useState('dhl-express');
  const [explanation, setExplanation] = useState<QuoteExplanationView | null>(null);
  const [pending, setPending] = useState<'quote' | 'explain' | 'accept' | 'save' | 'submit' | null>(
    null
  );
  const [actionError, setActionError] = useState('');
  const [actionStatus, setActionStatus] = useState('');
  const commodityCount = 1;
  const effectiveSelectedId = quote.options.some((option) => option.id === selectedId)
    ? selectedId
    : (quote.options.find((option) => option.available)?.id ?? quote.options[0]?.id ?? '');
  const selected =
    quote.options.find((option) => option.id === effectiveSelectedId) ?? quote.options[0]!;

  const updateForm = (update: (current: QuoteFormState) => QuoteFormState) => {
    const next = update(form);
    if (onDraftChange) onDraftChange(formToWorkflow(next, request.quote.quoteDate));
    else setLocalForm(next);
    setDirtySnapshotKey(quoteKey);
    setExplanation(null);
    setActionStatus('输入已更改；刷新报价后可解释或接受新快照。');
  };

  const run = async <T,>(kind: NonNullable<typeof pending>, operation: () => Promise<T>) => {
    setPending(kind);
    setActionError('');
    setActionStatus('');
    try {
      return await operation();
    } catch {
      setActionError(
        kind === 'quote'
          ? '报价失败；没有覆盖当前输入的有效价卡，请修正后重试。'
          : `${kind === 'explain' ? '解释' : '业务命令'}执行失败；数据未改变，请重试。`
      );
      return undefined;
    } finally {
      setPending(null);
    }
  };

  const refreshQuote = async () => {
    const next = await run('quote', () => port.create(request));
    if (next) {
      if (onSnapshotChange) onSnapshotChange(next);
      else setLocalQuote(next);
      setDirtySnapshotKey(null);
      setExplanation(null);
      setSelectedId(
        next.options.find((option) => option.available)?.id ?? next.options[0]?.id ?? ''
      );
    }
  };

  const loadExplanation = async () => {
    if (explanation) {
      setExplanation(null);
      return;
    }
    const snapshot = {
      quoteId: quote.id,
      optionId: selected.id,
      version: quote.version,
      localExplanation: {
        rateCardVersion: selected.rateCardVersion,
        steps: selected.explanationSteps,
      },
    };
    const next = await run('explain', () => port.explain(snapshot));
    if (
      next &&
      next.quoteId === quote.id &&
      next.optionId === selected.id &&
      next.version === quote.version
    )
      setExplanation(next);
  };

  if (state === 'loading')
    return (
      <div className="quote-state" aria-busy="true">
        正在校验地址、限制与价卡…
      </div>
    );
  if (state === 'empty')
    return <div className="quote-state">填写始发地、目的地和包裹后开始查价。</div>;
  if (state === 'failed')
    return (
      <div className="quote-state" role="alert">
        没有适用价卡 — 目的地与重量未命中分区 — 请维护价卡或选择替代渠道。
      </div>
    );
  if (state === 'forbidden')
    return (
      <div className="quote-state" role="alert">
        缺少 quote.create；可查看草稿但不能向渠道查价。
      </div>
    );
  if (state === 'expired')
    return (
      <div className="quote-state" role="alert">
        报价已过期；原结果只读保留，请重新计算。
      </div>
    );

  return (
    <section className="quote-workbench" aria-labelledby="quote-title">
      <div className="quote-workbench__form">
        <header>
          <div>
            <h1 id="quote-title">新建运单与报价说明</h1>
            <p>标准 / FBA 下单 · 地址、包裹、品名和限制校验</p>
          </div>
          <StatusTag tone="info">草稿待保存</StatusTag>
        </header>
        <fieldset className="quote-section quote-grid quote-grid--four">
          <legend>客户与渠道</legend>
          <label>
            客户
            <select
              value={form.customerId}
              disabled={readOnly}
              onChange={(event) =>
                updateForm((current) => ({ ...current, customerId: event.target.value }))
              }
            >
              <option value="customer-xinyuan">深圳鑫源贸易有限公司</option>
            </select>
          </label>
          <label>
            始发地 → 目的地
            <select value="route" disabled title="待集成：多线路地址模板端口尚未接入">
              <option value="route">CN-SZX → US-LAX</option>
            </select>
          </label>
          <label>
            订单类型
            <select
              value={form.orderType}
              disabled={readOnly}
              onChange={(event) =>
                updateForm((current) => ({
                  ...current,
                  orderType: event.target.value as QuoteFormState['orderType'],
                }))
              }
            >
              <option value="STANDARD">标准运单</option>
              <option value="FBA">FBA 入仓</option>
            </select>
          </label>
          <label>
            币种
            <select
              value={form.currency}
              disabled={readOnly}
              onChange={(event) =>
                updateForm((current) => ({ ...current, currency: event.target.value }))
              }
            >
              <option>CNY</option>
            </select>
          </label>
        </fieldset>
        {form.orderType === 'FBA' ? (
          <fieldset className="quote-section quote-grid quote-grid--three">
            <legend>Amazon FBA 关联</legend>
            <label>
              Amazon Shipment ID
              <input
                value={form.fbaShipmentId}
                disabled={readOnly}
                onChange={(event) =>
                  updateForm((current) => ({ ...current, fbaShipmentId: event.target.value }))
                }
              />
            </label>
            <label>
              FBA 箱数
              <input
                value={form.fbaBoxCount}
                disabled={readOnly}
                onChange={(event) =>
                  updateForm((current) => ({ ...current, fbaBoxCount: event.target.value }))
                }
              />
            </label>
            <label>
              目标仓
              <input
                value={form.fbaFulfillmentCenter}
                disabled={readOnly}
                onChange={(event) =>
                  updateForm((current) => ({
                    ...current,
                    fbaFulfillmentCenter: event.target.value,
                  }))
                }
              />
            </label>
          </fieldset>
        ) : null}
        <fieldset className="quote-section quote-grid quote-grid--three">
          <legend>收寄件信息</legend>
          <label>
            始发城市
            <input
              value={form.origin.city}
              disabled={readOnly}
              onChange={(event) =>
                updateForm((current) => ({
                  ...current,
                  origin: { ...current.origin, city: event.target.value },
                }))
              }
            />
          </label>
          <label>
            发货联系人
            <input
              value={form.origin.contactName}
              disabled={readOnly}
              onChange={(event) =>
                updateForm((current) => ({
                  ...current,
                  origin: { ...current.origin, contactName: event.target.value },
                }))
              }
            />
          </label>
          <label>
            发货电话
            <input
              value={form.origin.phone}
              disabled={readOnly}
              onChange={(event) =>
                updateForm((current) => ({
                  ...current,
                  origin: { ...current.origin, phone: event.target.value },
                }))
              }
            />
          </label>
          <label className="quote-span-two">
            发货地址
            <input
              value={form.origin.line1}
              disabled={readOnly}
              onChange={(event) =>
                updateForm((current) => ({
                  ...current,
                  origin: { ...current.origin, line1: event.target.value },
                }))
              }
            />
          </label>
          <label>
            始发地邮编
            <input
              value={form.origin.postalCode}
              disabled={readOnly}
              onChange={(event) =>
                updateForm((current) => ({
                  ...current,
                  origin: { ...current.origin, postalCode: event.target.value },
                }))
              }
            />
          </label>
          <label>
            目的地城市
            <input
              value={form.destination.city}
              disabled={readOnly}
              onChange={(event) =>
                updateForm((current) => ({
                  ...current,
                  destination: { ...current.destination, city: event.target.value },
                }))
              }
            />
          </label>
          <label>
            收货联系人
            <input
              value={form.destination.contactName}
              disabled={readOnly}
              onChange={(event) =>
                updateForm((current) => ({
                  ...current,
                  destination: { ...current.destination, contactName: event.target.value },
                }))
              }
            />
          </label>
          <label>
            收货电话
            <input
              value={form.destination.phone}
              disabled={readOnly}
              onChange={(event) =>
                updateForm((current) => ({
                  ...current,
                  destination: { ...current.destination, phone: event.target.value },
                }))
              }
            />
          </label>
          <label className="quote-span-two">
            收货地址
            <input
              value={form.destination.line1}
              disabled={readOnly}
              onChange={(event) =>
                updateForm((current) => ({
                  ...current,
                  destination: { ...current.destination, line1: event.target.value },
                }))
              }
            />
          </label>
          <label>
            目的地邮编
            <input
              value={form.destination.postalCode}
              disabled={readOnly}
              onChange={(event) =>
                updateForm((current) => ({
                  ...current,
                  destination: { ...current.destination, postalCode: event.target.value },
                }))
              }
            />
          </label>
        </fieldset>
        <fieldset className="quote-section">
          <legend>包裹与品名</legend>
          <div className="quote-package-row">
            <label>
              件数
              <input
                value={form.pieces}
                disabled={readOnly}
                onChange={(event) =>
                  updateForm((current) => ({ ...current, pieces: event.target.value }))
                }
              />
            </label>
            <label>
              实重 (kg)
              <input
                value={form.weightKg}
                disabled={readOnly}
                onChange={(event) =>
                  updateForm((current) => ({ ...current, weightKg: event.target.value }))
                }
              />
            </label>
            <label>
              长 (cm)
              <input
                value={form.lengthCm}
                disabled={readOnly}
                onChange={(event) =>
                  updateForm((current) => ({ ...current, lengthCm: event.target.value }))
                }
              />
            </label>
            <label>
              宽 (cm)
              <input
                value={form.widthCm}
                disabled={readOnly}
                onChange={(event) =>
                  updateForm((current) => ({ ...current, widthCm: event.target.value }))
                }
              />
            </label>
            <label>
              高 (cm)
              <input
                value={form.heightCm}
                disabled={readOnly}
                onChange={(event) =>
                  updateForm((current) => ({ ...current, heightCm: event.target.value }))
                }
              />
            </label>
            <label>
              材积重 (kg)
              <input value={quote.volumeWeightKg} readOnly />
            </label>
            <label>
              计费重 (kg)
              <input value={quote.chargeableWeightKg} readOnly />
            </label>
          </div>
          {Array.from({ length: commodityCount }, (_, index) => (
            <div className="quote-commodity-row" key={`commodity-${index + 1}`}>
              <span>{index + 1}</span>
              <input
                aria-label={`品名 ${index + 1}`}
                value={index === 0 ? form.commodityDescription : ''}
                disabled={readOnly}
                onChange={(event) => {
                  if (index === 0)
                    updateForm((current) => ({
                      ...current,
                      commodityDescription: event.target.value,
                    }));
                }}
              />
              <input
                aria-label={`HS 编码 ${index + 1}`}
                defaultValue={index === 0 ? '8504900000' : ''}
                disabled
                title="待契约扩展：报价请求尚无 HS 编码字段"
              />
              <input
                aria-label={`申报价值 ${index + 1}`}
                defaultValue={index === 0 ? '50,000.00' : ''}
                disabled
                title="待契约扩展：报价请求尚无申报价值字段"
              />
              <input
                aria-label={`原产国 ${index + 1}`}
                defaultValue="中国"
                disabled
                title="待契约扩展：报价请求尚无原产国字段"
              />
              <input
                aria-label={`数量 ${index + 1}`}
                defaultValue={index === 0 ? '5 箱' : '1'}
                disabled
                title="待契约扩展：报价请求尚无品名数量字段"
              />
            </div>
          ))}
          <div className="quote-inline-actions">
            <Button
              variant="secondary"
              size="compact"
              disabled
              title="待契约扩展：多品名结构尚未进入报价请求"
            >
              新增品名
            </Button>
            <Button
              variant="secondary"
              size="compact"
              disabled
              title="待集成：品名文件上传与字段映射端口尚未接入"
            >
              批量导入
            </Button>
            <small>批量导入待文件上传与映射端口接入；当前不可用。</small>
          </div>
        </fieldset>
        <fieldset className="quote-section quote-grid quote-grid--four">
          <legend>清关与附件</legend>
          <label>
            贸易条款
            <select defaultValue="FOB" disabled title="待契约扩展：报价请求尚无贸易条款字段">
              <option>FOB</option>
            </select>
          </label>
          <label>
            申报要素
            <select
              defaultValue="electronics"
              disabled
              title="待契约扩展：报价请求尚无申报要素字段"
            >
              <option value="electronics">电子产品</option>
            </select>
          </label>
          <label>
            监管条件
            <input defaultValue="无" disabled title="待契约扩展：报价请求尚无监管条件字段" />
          </label>
          <label>
            目的港清关
            <input defaultValue="自有清关" disabled title="待契约扩展：报价请求尚无清关方式字段" />
          </label>
        </fieldset>
        <footer className="quote-actions">
          <Button
            variant="secondary"
            disabled={readOnly || pending !== null}
            onClick={() =>
              void run('save', () => port.saveDraft(request)).then((result) => {
                if (result) setActionStatus(result.message ?? '草稿已保存');
              })
            }
          >
            {pending === 'save' ? '保存中…' : '保存草稿'}
          </Button>
          <Button
            disabled={readOnly || quoteDirty || pending !== null}
            onClick={() =>
              void run('submit', () =>
                port.submitForecast(quote.id, selected.id, quote.version)
              ).then(async (result) => {
                if (!result) return;
                setActionStatus(result.message ?? '预报已提交');
                await onSubmitForecast?.();
              })
            }
          >
            {pending === 'submit' ? '提交中…' : '提交预报'}
          </Button>
          <Button variant="quiet" disabled title="待集成：复制草稿、模板和导出命令端口尚未接入">
            更多操作
          </Button>
          {actionError ? <span role="alert">{actionError}</span> : null}
          {actionStatus ? <span role="status">{actionStatus}</span> : null}
        </footer>
      </div>
      <aside className="quote-workbench__result" aria-label="报价与限制">
        <header>
          <div>
            <h2>报价与限制</h2>
            <span>{quote.quoteNo}</span>
          </div>
          <Button
            variant="secondary"
            size="compact"
            disabled={readOnly || pending !== null}
            onClick={() => void refreshQuote()}
          >
            {pending === 'quote'
              ? '报价中…'
              : actionError.startsWith('报价失败')
                ? '重试报价'
                : '刷新报价'}
          </Button>
        </header>
        {state === 'stale' ? (
          <div className="quote-alert">
            价卡已从 v3 发布为 v4；旧结果保留，接受前必须重算。
            <Button size="compact" onClick={() => void refreshQuote()}>
              按 v4 重新计算
            </Button>
          </div>
        ) : null}
        <div className="quote-options" role="radiogroup" aria-label="渠道报价">
          {quote.options.map((option) => (
            <label
              key={option.id}
              data-selected={effectiveSelectedId === option.id || undefined}
              data-disabled={!option.available || undefined}
            >
              <input
                type="radio"
                name="channel"
                aria-label={`${option.product} ${formatMoney(option.total)}`}
                checked={effectiveSelectedId === option.id}
                disabled={!option.available}
                onChange={() => {
                  setSelectedId(option.id);
                  setExplanation(null);
                }}
              />
              <span>
                <strong>{option.product}</strong>
                {option.recommended ? <em>推荐</em> : null}
                {option.unavailableReason ? <small>{option.unavailableReason}</small> : null}
              </span>
              <b>{formatMoney(option.total)}</b>
            </label>
          ))}
        </div>
        <section className="quote-breakdown">
          <h3>
            已选渠道 <span>{selected.product}</span>
          </h3>
          <dl>
            <dt>计费重</dt>
            <dd>{quote.chargeableWeightKg} kg</dd>
            {selected.lines.map((line) => (
              <div key={line.code}>
                <dt>{line.label}</dt>
                <dd>{formatMoney(line.amount)}</dd>
              </div>
            ))}
            <dt className="quote-total">预计总价</dt>
            <dd className="quote-total">{formatMoney(selected.total)}</dd>
          </dl>
          {state === 'forbidden-cost' ? (
            <div className="quote-cost-mask">
              <strong>成本与利润：••••</strong>
              <span>缺少 rate.cost.read；复制与导出同样脱敏。</span>
            </div>
          ) : (
            <div className="quote-cost">
              {selected.cost && selected.margin && selected.marginPercent ? (
                <>
                  <span>成本 {formatMoney(selected.cost)}</span>
                  <span>
                    毛利 {formatMoney(selected.margin)} / {selected.marginPercent}
                  </span>
                </>
              ) : (
                <span>成本与毛利未由服务端报价契约返回</span>
              )}
            </div>
          )}
          <Button
            variant="secondary"
            size="compact"
            disabled={quoteDirty || pending !== null}
            onClick={() => void loadExplanation()}
          >
            {pending === 'explain' ? '加载解释…' : explanation ? '收起解释' : '查看解释'}
          </Button>
          <Button
            size="compact"
            disabled={readOnly || quoteDirty || pending !== null}
            onClick={() =>
              void run('accept', () => port.accept(quote.id, selected.id, quote.version)).then(
                (result) => {
                  if (result) setActionStatus(`已接受 ${selected.product} 不可变报价快照`);
                }
              )
            }
          >
            {pending === 'accept' ? '接受中…' : '接受报价'}
          </Button>
        </section>
        {explanation ? (
          <section className="quote-explanation">
            <h3>报价说明</h3>
            <p>{explanation.rateCardVersion}</p>
            <ol>
              {explanation.steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          </section>
        ) : null}
      </aside>
    </section>
  );
}
