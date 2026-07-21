import { Button, StatusTag } from '@zhili/ui';
import { useMemo, useState } from 'react';
import { calculateQuote, formatMoney, quoteInputFixture } from '../model/quote';
import './quote-workbench.css';

export type QuoteViewState =
  'normal' | 'loading' | 'empty' | 'failed' | 'forbidden' | 'expired' | 'forbidden-cost' | 'stale';

export interface QuoteWorkbenchProps {
  state?: QuoteViewState;
  onSubmitForecast?: () => void;
}

export function QuoteWorkbench({ state = 'normal', onSubmitForecast }: QuoteWorkbenchProps) {
  const quote = useMemo(() => calculateQuote(quoteInputFixture), []);
  const [selectedId, setSelectedId] = useState('dhl-express');
  const [explanationOpen, setExplanationOpen] = useState(false);
  const selected = quote.options.find((option) => option.id === selectedId) ?? quote.options[0]!;

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
              <input defaultValue="123.50" />
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
          <div className="quote-commodity-row">
            <span>1</span>
            <input aria-label="品名" defaultValue="电子产品及配件" />
            <input aria-label="HS 编码" defaultValue="8504900000" />
            <input aria-label="申报价值" defaultValue="50,000.00" />
            <input aria-label="原产国" defaultValue="中国" />
            <input aria-label="数量" defaultValue="5 箱" />
          </div>
          <div className="quote-inline-actions">
            <Button variant="secondary" size="compact">
              新增品名
            </Button>
            <Button variant="secondary" size="compact">
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
          <Button variant="secondary">保存草稿</Button>
          <Button onClick={onSubmitForecast}>提交预报</Button>
          <Button variant="quiet">更多操作</Button>
        </footer>
      </div>
      <aside className="quote-workbench__result" aria-label="报价与限制">
        <header>
          <div>
            <h2>报价与限制</h2>
            <span>{quote.quoteNo}</span>
          </div>
          <Button variant="secondary" size="compact">
            刷新报价
          </Button>
        </header>
        {state === 'stale' ? (
          <div className="quote-alert">
            价卡已从 v3 发布为 v4；旧结果保留，接受前必须重算。
            <Button size="compact">按 v4 重新计算</Button>
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
              <span>成本 CNY 4,580.50</span>
              <span>毛利 CNY 739.50 / 13.90%</span>
            </div>
          )}
          <Button
            variant="secondary"
            size="compact"
            onClick={() => setExplanationOpen((open) => !open)}
          >
            查看解释
          </Button>
        </section>
        {explanationOpen ? (
          <section className="quote-explanation">
            <h3>报价说明</h3>
            <p>{quote.rateCardVersion}</p>
            <ol>
              <li>计费重取实重与材积重较大值：max(123.50, 80.00)</li>
              <li>基础运费按 38.36 × 122 kg 的已保存快照计价</li>
              <li>燃油附加费使用规则版本 FUEL-11.00%</li>
              <li>偏远附加费按目的地邮编 90001 计算</li>
            </ol>
          </section>
        ) : null}
      </aside>
    </section>
  );
}
