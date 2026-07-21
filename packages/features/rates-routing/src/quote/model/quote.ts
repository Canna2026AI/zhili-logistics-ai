import type { components } from '@zhili/contracts';

type Money = components['schemas']['Money'];
type QuoteLine = components['schemas']['QuoteLine'];
type QuoteRequest = components['schemas']['CreateQuoteRequest'];

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
}

export interface CalculatedQuote {
  quoteNo: string;
  rateCardVersion: string;
  chargeableWeightKg: string;
  volumeWeightKg: string;
  options: CalculatedOption[];
}

export const quoteInputFixture: QuoteInputFixture = {
  volumeDivisor: 6000,
  request: {
    customerId: 'customer-xinyuan',
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

function money(amount: number): Money {
  return { amount: (amount / 100).toFixed(2), currency: 'CNY' };
}

function sumLines(lines: QuoteLine[]): Money {
  const cents = lines.reduce((sum, line) => sum + Math.round(Number(line.amount.amount) * 100), 0);
  return money(cents);
}

export function calculateQuote(input: QuoteInputFixture): CalculatedQuote {
  const firstPackage = input.request.packages[0];
  if (!firstPackage) throw new Error('至少需要一个包裹');
  const volumeWeight =
    (Number(firstPackage.lengthCm) * Number(firstPackage.widthCm) * Number(firstPackage.heightCm)) /
    input.volumeDivisor;
  const chargeableWeight = Math.max(Number(firstPackage.weightKg), volumeWeight);
  const dhlLines: QuoteLine[] = [
    { code: 'FREIGHT', label: '基础运费', amount: money(468000), ruleVersion: 'BASE-38.36' },
    { code: 'FUEL', label: '燃油附加费', amount: money(51480), ruleVersion: 'FUEL-11.00%' },
    { code: 'REMOTE', label: '偏远附加费', amount: money(8000), ruleVersion: 'REMOTE-US-90001' },
    { code: 'HANDLING', label: '操作费', amount: money(4520), ruleVersion: 'HANDLING-FIXED' },
  ];
  const upsLines: QuoteLine[] = [
    { code: 'FREIGHT', label: '基础运费', amount: money(489000) },
    { code: 'FUEL', label: '燃油附加费', amount: money(59000) },
  ];
  const airLines: QuoteLine[] = [{ code: 'FREIGHT', label: '基础运费', amount: money(498000) }];
  return {
    quoteNo: 'Q2505120042',
    rateCardVersion: 'RATE-DHL-CN-US-2026.05-v3',
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
        total: sumLines(dhlLines),
      },
      {
        id: 'ups-saver',
        carrier: 'UPS',
        product: 'UPS Worldwide Saver',
        available: true,
        lines: upsLines,
        total: sumLines(upsLines),
      },
      {
        id: 'air-special',
        carrier: '专线',
        product: '美西空派（含电）',
        available: false,
        unavailableReason: '单件最长边 100 cm 超出该渠道 80 cm 限制',
        lines: airLines,
        total: sumLines(airLines),
      },
    ],
  };
}

export function formatMoney(value: Money) {
  return `${value.currency} ${Number(value.amount).toLocaleString('zh-CN', { minimumFractionDigits: 2 })}`;
}
