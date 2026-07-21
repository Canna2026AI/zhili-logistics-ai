export type MasterDataCategory = '客户' | '联系人' | '组织' | '仓库' | '合作方' | '币种' | '费用';

export interface MasterDataRecord {
  id: string;
  category: MasterDataCategory;
  code: string;
  name: string;
  scope: string;
  status: '启用' | '停用' | '待审核';
  version: number;
  branch: string;
  creditLimit?: string;
  paymentTerms?: string;
}

export interface CreateCustomerInput {
  name: string;
  scope: string;
  creditLimit: string;
  paymentTerms: string;
}

export interface MasterDataPort {
  createCustomer(input: CreateCustomerInput): Promise<MasterDataRecord>;
}

let localCustomerSequence = 256;

export const memoryMasterDataPort: MasterDataPort = {
  async createCustomer(input) {
    localCustomerSequence += 1;
    return {
      id: `customer-local-${localCustomerSequence}`,
      category: '客户',
      code: `CUST${String(localCustomerSequence).padStart(5, '0')}`,
      name: input.name,
      scope: input.scope,
      status: '待审核',
      version: 1,
      branch: input.scope,
      creditLimit: input.creditLimit,
      paymentTerms: input.paymentTerms,
    };
  },
};

export const masterDataFixtures: MasterDataRecord[] = [
  {
    id: 'customer-xinyuan',
    category: '客户',
    code: 'CUST00256',
    name: '深圳鑫源贸易有限公司',
    scope: '深圳分公司',
    status: '启用',
    version: 7,
    branch: '深圳分公司',
    creditLimit: 'CNY 500,000.00',
    paymentTerms: '月结 30 天',
  },
  {
    id: 'contact-wang',
    category: '联系人',
    code: 'CONT00182',
    name: '王志强 · 139 2654 8800',
    scope: 'CUST00256',
    status: '启用',
    version: 4,
    branch: '深圳分公司',
  },
  {
    id: 'org-sz',
    category: '组织',
    code: 'ORG-SZX',
    name: '智立科技（深圳）有限公司',
    scope: '租户根组织',
    status: '启用',
    version: 12,
    branch: '深圳分公司',
  },
  {
    id: 'warehouse-sz',
    category: '仓库',
    code: 'WH-SZX-01',
    name: '深圳仓库',
    scope: '深圳分公司',
    status: '启用',
    version: 9,
    branch: '深圳分公司',
  },
  {
    id: 'partner-dhl',
    category: '合作方',
    code: 'PARTNER-DHL-CN',
    name: 'DHL Express 中国',
    scope: '国际快递供应商',
    status: '启用',
    version: 5,
    branch: '深圳分公司',
  },
  {
    id: 'currency-cny',
    category: '币种',
    code: 'CNY',
    name: '人民币',
    scope: '默认结算币种 · 2 位精度',
    status: '启用',
    version: 3,
    branch: '全租户',
  },
  {
    id: 'charge-freight',
    category: '费用',
    code: 'FREIGHT',
    name: '基础运费',
    scope: '应收 / 应付',
    status: '启用',
    version: 6,
    branch: '全租户',
  },
];

export function filterMasterData(records: MasterDataRecord[], query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return records;
  return records.filter((record) =>
    `${record.category}${record.code}${record.name}${record.scope}`
      .toLowerCase()
      .includes(normalized)
  );
}

export function maskPhoneInName(value: string) {
  return value.replace(/(1\d{2})\s?\d{4}\s?(\d{4})/, '$1 **** $2');
}
