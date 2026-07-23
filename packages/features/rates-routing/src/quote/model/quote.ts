import type { components } from '@zhili/contracts';

type Money = components['schemas']['Money'];
type QuoteLine = components['schemas']['QuoteLine'];
type QuoteRequest = components['schemas']['CreateQuoteRequest'];
type OrderType = components['schemas']['CreateOrderDraftRequest']['orderType'];

export interface QuoteInputFixture {
  request: QuoteRequest;
  volumeDivisor: number;
}

export interface CalculatedOption {
  id: string;
  carrier: string;
  product: string;
  recommended?: boolean;
  available: boolean;
  unavailableReason?: string;
  lines: QuoteLine[];
  total: Money;
  cost?: Money;
  margin?: Money;
  marginPercent?: string;
  rateCardVersion: string;
  explanationSteps: string[];
}

export interface CalculatedQuote {
  id: string;
  quoteNo: string;
  status?: 'DRAFT' | 'CALCULATED' | 'ACCEPTED' | 'EXPIRED';
  acceptedOptionId?: string | null;
  validUntil?: string;
  version: number;
  chargeableWeightKg: string;
  volumeWeightKg: string;
  options: CalculatedOption[];
}

export interface QuoteExplanationView {
  quoteId: string;
  optionId: string;
  version: number;
  rateCardVersion: string;
  steps: string[];
}

export interface QuoteOrderContext {
  orderType: OrderType;
  fba?: {
    shipmentId: string;
    boxCount: number;
    fulfillmentCenter: string;
  };
}

export interface QuoteWorkflowRequest {
  quote: QuoteRequest;
  orderContext: QuoteOrderContext;
}

export interface QuoteSnapshotRef {
  quoteId: string;
  optionId: string;
  version: number;
  localExplanation?: {
    rateCardVersion: string;
    steps: string[];
  };
}

export interface QuoteActionResult {
  acceptedOptionId?: string;
  version: number;
  message?: string;
}

export interface QuotePort {
  create(request: QuoteWorkflowRequest): Promise<CalculatedQuote>;
  explain(snapshot: QuoteSnapshotRef): Promise<QuoteExplanationView>;
  accept(quoteId: string, optionId: string, version: number): Promise<CalculatedQuote>;
  saveDraft(request: QuoteWorkflowRequest): Promise<QuoteActionResult>;
  submitForecast(quoteId: string, optionId: string, version: number): Promise<QuoteActionResult>;
}

export const quoteInputFixture: QuoteInputFixture = {
  volumeDivisor: 6000,
  request: {
    customerId: '01JY8Z8F6ME4F0Y9QH2X6D4R7A',
    origin: {
      countryCode: 'CN',
      city: '深圳',
      line1: '宝安区西乡街道建源路 2001 号',
      postalCode: '518102',
      contactName: '王经理',
      phone: '+86 755 1234 5678',
    },
    destination: {
      countryCode: 'US',
      state: 'CA',
      city: 'Los Angeles',
      line1: '123 Harbor Ave',
      postalCode: '90001',
      contactName: 'John Smith',
      phone: '+1 213 555 0199',
    },
    packages: [
      {
        packageRef: 'PKG-01',
        weightKg: '123.50',
        lengthCm: '100',
        widthCm: '80',
        heightCm: '60',
        commodityDescription: '电子产品及配件',
      },
    ],
    quoteDate: '2026-07-22',
    currency: 'CNY',
  },
};

export const quoteWorkflowFixture: QuoteWorkflowRequest = {
  quote: quoteInputFixture.request,
  orderContext: { orderType: 'STANDARD' },
};

function money(amount: number): Money {
  return { amount: (amount / 100).toFixed(2), currency: 'CNY' };
}

function proportionalCents(canonicalCents: number, chargeableWeight: number) {
  return Math.round((canonicalCents / 123.5) * chargeableWeight);
}

function optionFinancials(total: Money, canonicalCostCents: number, chargeableWeight: number) {
  const cost = money(proportionalCents(canonicalCostCents, chargeableWeight));
  const marginCents = Math.round((Number(total.amount) - Number(cost.amount)) * 100);
  return {
    cost,
    margin: money(marginCents),
    marginPercent: `${((marginCents / Math.round(Number(total.amount) * 100)) * 100).toFixed(2)}%`,
  };
}

function sumLines(lines: QuoteLine[]): Money {
  const cents = lines.reduce((sum, line) => sum + Math.round(Number(line.amount.amount) * 100), 0);
  return money(cents);
}

export function calculateQuote(input: QuoteInputFixture): CalculatedQuote {
  const firstPackage = input.request.packages[0];
  if (!firstPackage) throw new Error('至少需要一个包裹');
  const volumeWeight = input.request.packages.reduce(
    (total, item) =>
      total +
      (Number(item.lengthCm) * Number(item.widthCm) * Number(item.heightCm)) / input.volumeDivisor,
    0
  );
  const actualWeight = input.request.packages.reduce(
    (total, item) => total + Number(item.weightKg),
    0
  );
  const chargeableWeight = Math.max(actualWeight, volumeWeight);
  const longestEdge = Math.max(
    ...input.request.packages.flatMap((item) => [
      Number(item.lengthCm),
      Number(item.widthCm),
      Number(item.heightCm),
    ])
  );
  const dhlFreight = proportionalCents(468000, chargeableWeight);
  const dhlLines: QuoteLine[] = [
    {
      code: 'FREIGHT',
      label: '基础运费',
      amount: money(dhlFreight),
      ruleVersion: 'BASE-37.8947368-CNY-KG',
    },
    {
      code: 'FUEL',
      label: '燃油附加费',
      amount: money(Math.round(dhlFreight * 0.11)),
      ruleVersion: 'FUEL-11.00%',
    },
    { code: 'REMOTE', label: '偏远附加费', amount: money(8000), ruleVersion: 'REMOTE-US-90001' },
    { code: 'HANDLING', label: '操作费', amount: money(4520), ruleVersion: 'HANDLING-FIXED' },
  ];
  const upsFreight = proportionalCents(489000, chargeableWeight);
  const upsLines: QuoteLine[] = [
    {
      code: 'FREIGHT',
      label: '基础运费',
      amount: money(upsFreight),
      ruleVersion: 'UPS-BASE-39.5951417-CNY-KG',
    },
    {
      code: 'FUEL',
      label: '燃油附加费',
      amount: money(Math.round(upsFreight * (59000 / 489000))),
      ruleVersion: 'UPS-FUEL-12.0654%',
    },
  ];
  const airLines: QuoteLine[] = [
    {
      code: 'FREIGHT',
      label: '基础运费',
      amount: money(proportionalCents(498000, chargeableWeight)),
      ruleVersion: 'AIR-BASE-40.3238866-CNY-KG',
    },
  ];
  const dhlTotal = sumLines(dhlLines);
  const upsTotal = sumLines(upsLines);
  const airTotal = sumLines(airLines);
  return {
    id: 'quote-2505120042',
    quoteNo: 'Q2505120042',
    version: 1,
    chargeableWeightKg: chargeableWeight.toFixed(2),
    volumeWeightKg: volumeWeight.toFixed(2),
    options: [
      {
        id: 'dhl-express',
        carrier: 'DHL',
        product: 'DHL Express Worldwide',
        recommended: true,
        available: true,
        lines: dhlLines,
        total: dhlTotal,
        ...optionFinancials(dhlTotal, 458050, chargeableWeight),
        rateCardVersion: 'RATE-DHL-CN-US-2026.05-v3',
        explanationSteps: [
          `计费重取实重与材积重较大值：max(${actualWeight.toFixed(2)}, ${volumeWeight.toFixed(2)})`,
          `基础运费按 37.8947368 × ${chargeableWeight.toFixed(2)} kg 计算`,
          '燃油附加费按本次基础运费 × 11.00% 计算',
          `偏远附加费按目的地邮编 ${input.request.destination.postalCode ?? '未提供'} 计算`,
        ],
      },
      {
        id: 'ups-saver',
        carrier: 'UPS',
        product: 'UPS Worldwide Saver',
        available: true,
        lines: upsLines,
        total: upsTotal,
        ...optionFinancials(upsTotal, 471000, chargeableWeight),
        rateCardVersion: 'RATE-UPS-CN-US-2026.05-v5',
        explanationSteps: [
          `UPS 计费重为 ${chargeableWeight.toFixed(2)} kg`,
          `基础运费按 39.5951417 × ${chargeableWeight.toFixed(2)} kg 计算`,
          '燃油附加费按 UPS-FUEL-12.0654% 计算',
        ],
      },
      {
        id: 'air-special',
        carrier: '专线',
        product: '美西空派（含电）',
        available: false,
        unavailableReason: `单件最长边 ${longestEdge} cm 超出该渠道 80 cm 限制`,
        lines: airLines,
        total: airTotal,
        ...optionFinancials(airTotal, 452000, chargeableWeight),
        rateCardVersion: 'RATE-AIR-CN-US-2026.04-v2',
        explanationSteps: [
          `专线计费重为 ${chargeableWeight.toFixed(2)} kg`,
          '单件最长边超过渠道限制，本方案不可接受',
        ],
      },
    ],
  };
}

export const memoryQuotePort: QuotePort = {
  async create(workflow) {
    return calculateQuote({
      request: workflow.quote,
      volumeDivisor: quoteInputFixture.volumeDivisor,
    });
  },
  async explain(snapshot) {
    if (!snapshot.localExplanation) throw new Error('QUOTE_SNAPSHOT_NOT_FOUND');
    return {
      quoteId: snapshot.quoteId,
      optionId: snapshot.optionId,
      version: snapshot.version,
      ...snapshot.localExplanation,
    };
  },
  async accept(_quoteId, optionId, version) {
    return {
      ...calculateQuote(quoteInputFixture),
      id: _quoteId,
      status: 'ACCEPTED',
      acceptedOptionId: optionId,
      version: version + 1,
    };
  },
  async saveDraft() {
    return { version: 1, message: '草稿 ORD-DRAFT-0268 已保存' };
  },
  async submitForecast(_quoteId, optionId, version) {
    return { acceptedOptionId: optionId, version: version + 1, message: '预报已提交' };
  },
};

export function formatMoney(value: Money) {
  return `${value.currency} ${Number(value.amount).toLocaleString('zh-CN', { minimumFractionDigits: 2 })}`;
}
