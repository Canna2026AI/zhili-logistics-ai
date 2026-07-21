import { Button, StatusTag } from '@zhili/ui';
import { useMemo, useState } from 'react';
import {
  calculateQuote,
  formatMoney,
  memoryQuotePort,
  quoteInputFixture,
  type QuoteExplanationView,
  type QuotePort,
} from '../model/quote';
import './quote-workbench.css';

export type QuoteViewState =
  'normal' | 'loading' | 'empty' | 'failed' | 'forbidden' | 'expired' | 'forbidden-cost' | 'stale';

export interface QuoteWorkbenchProps {
  state?: QuoteViewState;
  port?: QuotePort;
  readOnly?: boolean;
  onSubmitForecast?: () => void | Promise<void>;
}

export function QuoteWorkbench({
  state = 'normal',
  port = memoryQuotePort,
  readOnly = false,
  onSubmitForecast,
}: QuoteWorkbenchProps) {
  const [weightKg, setWeightKg] = useState(quoteInputFixture.request.packages[0]?.weightKg ?? '0');
  const request = useMemo(
    () => ({
      ...quoteInputFixture.request,
      packages: quoteInputFixture.request.packages.map((item, index) =>
        index === 0 ? { ...item, weightKg } : item
      ),
    }),
    [weightKg]
  );
  const [quote, setQuote] = useState(() => calculateQuote(quoteInputFixture));
  const [selectedId, setSelectedId] = useState('dhl-express');
  const [explanation, setExplanation] = useState<QuoteExplanationView | null>(null);
  const [pending, setPending] = useState<'quote' | 'explain' | 'accept' | 'save' | 'submit' | null>(
    null
  );
  const [actionError, setActionError] = useState('');
  const [actionStatus, setActionStatus] = useState('');
  const [commodityCount, setCommodityCount] = useState(1);
  const selected = quote.options.find((option) => option.id === selectedId) ?? quote.options[0]!;

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
      setQuote(next);
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
    const next = await run('explain', () => port.explain(quote.id, selected.id));
    if (next) setExplanation(next);
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
          <StatusTag tone="info">草稿自动保存</StatusTag>
        </header>
        <fieldset className="quote-section quote-grid quote-grid--four">
          <legend>客户与渠道</legend>
          <label>
            客户
            <select defaultValue="xinyuan">
              <option value="xinyuan">深圳鑫源贸易有限公司</option>
            </select>
          </label>
          <label>
            始发地 → 目的地
            <select defaultValue="route">
              <option value="route">CN-SZX → US-LAX</option>
            </select>
          </label>
          <label>
            订单类型
            <select defaultValue="standard">
              <option value="standard">标准运单</option>
              <option value="fba">FBA 入仓</option>
            </select>
          </label>
          <label>
            币种
            <select defaultValue="CNY">
              <option>CNY</option>
            </select>
          </label>
        </fieldset>
        <fieldset className="quote-section quote-grid quote-grid--three">
          <legend>收寄件信息</legend>
          <label>
            发货人
            <input defaultValue="深圳鑫源贸易有限公司" />
          </label>
          <label>
            联系人
            <input defaultValue="王经理" />
          </label>
          <label>
            电话
            <input defaultValue="+86 755 1234 5678" />
          </label>
          <label className="quote-span-two">
            发货地址
            <input defaultValue="广东省深圳市宝安区西乡街道建源路 2001 号" />
          </label>
          <label>
            国家/地区
            <input defaultValue="中国" />
          </label>
          <label>
            收货人
            <input defaultValue="LAX RECEIVING WAREHOUSE" />
          </label>
          <label>
            联系人
            <input defaultValue="John Smith" />
          </label>
          <label>
            电话
            <input defaultValue="+1 213 555 0199" />
          </label>
          <label className="quote-span-two">
            收货地址
            <input defaultValue="123 Harbor Ave, Los Angeles, CA 90001, USA" />
          </label>
          <label>
            国家/地区
            <input defaultValue="美国" />
          </label>
        </fieldset>
        <fieldset className="quote-section">
          <legend>包裹与品名</legend>
          <div className="quote-package-row">
            <label>
              件数
              <input defaultValue="1" />
            </label>
            <label>
              实重 (kg)
              <input
                value={weightKg}
                disabled={readOnly}
                onChange={(event) => setWeightKg(event.target.value)}
              />
            </label>
            <label>
              体积 (cm)
              <input defaultValue="100 × 80 × 60" />
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
                defaultValue={index === 0 ? '电子产品及配件' : ''}
              />
              <input
                aria-label={`HS 编码 ${index + 1}`}
                defaultValue={index === 0 ? '8504900000' : ''}
              />
              <input
                aria-label={`申报价值 ${index + 1}`}
                defaultValue={index === 0 ? '50,000.00' : ''}
              />
              <input aria-label={`原产国 ${index + 1}`} defaultValue="中国" />
              <input aria-label={`数量 ${index + 1}`} defaultValue={index === 0 ? '5 箱' : '1'} />
            </div>
          ))}
          <div className="quote-inline-actions">
            <Button
              variant="secondary"
              size="compact"
              disabled={readOnly}
              onClick={() => setCommodityCount((count) => count + 1)}
            >
              新增品名
            </Button>
            <Button
              variant="secondary"
              size="compact"
              disabled={readOnly}
              onClick={() => setActionStatus('已打开品名批量导入映射；当前表单内容保持不变。')}
            >
              批量导入
            </Button>
          </div>
        </fieldset>
        <fieldset className="quote-section quote-grid quote-grid--four">
          <legend>清关与附件</legend>
          <label>
            贸易条款
            <select defaultValue="FOB">
              <option>FOB</option>
            </select>
          </label>
          <label>
            申报要素
            <select defaultValue="electronics">
              <option value="electronics">电子产品</option>
            </select>
          </label>
          <label>
            监管条件
            <input defaultValue="无" />
          </label>
          <label>
            目的港清关
            <input defaultValue="自有清关" />
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
            disabled={readOnly || pending !== null}
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
          <Button
            variant="quiet"
            disabled={readOnly}
            onClick={() => setActionStatus('更多操作：复制草稿、保存模板、导出校验报告。')}
          >
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
              data-selected={selectedId === option.id || undefined}
              data-disabled={!option.available || undefined}
            >
              <input
                type="radio"
                name="channel"
                aria-label={`${option.product} ${formatMoney(option.total)}`}
                checked={selectedId === option.id}
                disabled={!option.available}
                onChange={() => setSelectedId(option.id)}
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
              <span>成本 {formatMoney(selected.cost)}</span>
              <span>
                毛利 {formatMoney(selected.margin)} / {selected.marginPercent}
              </span>
            </div>
          )}
          <Button
            variant="secondary"
            size="compact"
            disabled={pending !== null}
            onClick={() => void loadExplanation()}
          >
            {pending === 'explain' ? '加载解释…' : explanation ? '收起解释' : '查看解释'}
          </Button>
          <Button
            size="compact"
            disabled={readOnly || pending !== null}
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
