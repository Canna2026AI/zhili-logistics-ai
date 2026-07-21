export type RateCatalogKind = '渠道产品' | '分区' | '价卡' | '附加费' | '限制' | '特殊价';

export interface RateCatalogRecord {
  id: string;
  kind: RateCatalogKind;
  code: string;
  name: string;
  rule: string;
  version: string;
  status: '生效' | '草稿' | '待发布';
}

export interface RateCatalogPublishResult {
  version: string;
  status: RateCatalogRecord['status'];
}

export interface RateCatalogPort {
  publish(rateCardId: string, version: number, reason: string): Promise<RateCatalogPublishResult>;
}

export const memoryRateCatalogPort: RateCatalogPort = {
  async publish() {
    return { version: 'v4', status: '生效' };
  },
};

export const rateCatalogFixture: RateCatalogRecord[] = [
  {
    id: 'channel-dhl',
    kind: '渠道产品',
    code: 'DHL-WW',
    name: 'DHL Express Worldwide',
    rule: 'CN → US · 快递',
    version: 'v8',
    status: '生效',
  },
  {
    id: 'zone-us-west',
    kind: '分区',
    code: 'ZONE-US-WEST',
    name: '美国西部',
    rule: 'CA / OR / WA',
    version: 'v5',
    status: '生效',
  },
  {
    id: 'rate-dhl',
    kind: '价卡',
    code: 'RATE-DHL-CN-US',
    name: 'DHL 中美销售价',
    rule: '0–300 kg 分段价 · 0.5kg 进位 · 最低 CNY 180',
    version: 'v3',
    status: '生效',
  },
  {
    id: 'fuel',
    kind: '附加费',
    code: 'FUEL',
    name: '燃油附加费',
    rule: '基础运费 × 11.00%',
    version: 'v12',
    status: '生效',
  },
  {
    id: 'restriction',
    kind: '限制',
    code: 'MAX-LENGTH',
    name: '单件最长边',
    rule: '≤ 120 cm',
    version: 'v4',
    status: '生效',
  },
  {
    id: 'special-xinyuan',
    kind: '特殊价',
    code: 'SP-CUST00256',
    name: '深圳鑫源贸易有限公司',
    rule: '基础价 - 3.5%',
    version: 'v2',
    status: '待发布',
  },
];

export interface RateRange {
  from: number;
  to: number;
}

export function validateRateCard(ranges: RateRange[]) {
  const sorted = [...ranges].sort((a, b) => a.from - b.from);
  for (let index = 1; index < sorted.length; index += 1) {
    if (sorted[index]!.from <= sorted[index - 1]!.to) {
      return {
        valid: false,
        reason: `区间 ${sorted[index - 1]!.from}-${sorted[index - 1]!.to} 与 ${sorted[index]!.from}-${sorted[index]!.to} 重叠`,
      };
    }
  }
  return { valid: true };
}
