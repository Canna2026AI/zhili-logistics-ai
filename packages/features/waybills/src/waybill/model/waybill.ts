export type WaybillStateLabel =
  '待收货' | '待分货' | '待转运' | '转运中' | '已发货' | '已签收' | '问题件';
export type WaybillStateFilter = '全部运单' | WaybillStateLabel;

export interface WaybillListItem {
  id: string;
  waybillNo: string;
  masterNo: string;
  customer: string;
  state: WaybillStateLabel;
  transport: string;
  destination: string;
  pieces: number;
  weightKg: string;
  createdAt: string;
  version: number;
}

export const waybillFixtures: WaybillListItem[] = [
  {
    id: 'wb-001',
    waybillNo: 'S2505120001',
    masterNo: 'HBL2505120001',
    customer: '华南百货',
    state: '转运中',
    transport: '海运整箱',
    destination: '美国/洛杉矶',
    pieces: 20,
    weightKg: '12,340.50',
    createdAt: '2025-05-12 10:21',
    version: 5,
  },
  {
    id: 'wb-002',
    waybillNo: 'S2505120002',
    masterNo: 'HBL2505120002',
    customer: '欧陆贸易',
    state: '待收货',
    transport: '空运',
    destination: '德国/法兰克福',
    pieces: 5,
    weightKg: '320.00',
    createdAt: '2025-05-12 09:48',
    version: 2,
  },
  {
    id: 'wb-003',
    waybillNo: 'S2505120003',
    masterNo: 'HBL2505120003',
    customer: '英伦商贸',
    state: '待分货',
    transport: '海运拼箱',
    destination: '英国/伦敦',
    pieces: 8,
    weightKg: '1,250.30',
    createdAt: '2025-05-12 09:30',
    version: 4,
  },
  {
    id: 'wb-004',
    waybillNo: 'S2505120004',
    masterNo: 'HBL2505120004',
    customer: '深圳鑫源贸易有限公司',
    state: '待分货',
    transport: '海运整箱',
    destination: '美国/洛杉矶',
    pieces: 18,
    weightKg: '123.50',
    createdAt: '2025-05-12 08:16',
    version: 7,
  },
  {
    id: 'wb-005',
    waybillNo: 'S2505120005',
    masterNo: 'HBL2505120005',
    customer: '北方机械',
    state: '待转运',
    transport: '铁路',
    destination: '俄罗斯/莫斯科',
    pieces: 12,
    weightKg: '6,500.00',
    createdAt: '2025-05-12 07:55',
    version: 3,
  },
  {
    id: 'wb-006',
    waybillNo: 'S2505120006',
    masterNo: 'HBL2505120006',
    customer: '东亚服饰',
    state: '已签收',
    transport: '空运',
    destination: '日本/东京',
    pieces: 3,
    weightKg: '120.00',
    createdAt: '2025-05-11 18:22',
    version: 9,
  },
  {
    id: 'wb-007',
    waybillNo: 'S2505120007',
    masterNo: 'HBL2505120007',
    customer: '加枫家居',
    state: '问题件',
    transport: '海运拼箱',
    destination: '加拿大/温哥华',
    pieces: 7,
    weightKg: '980.40',
    createdAt: '2025-05-11 16:41',
    version: 6,
  },
  {
    id: 'wb-008',
    waybillNo: 'S2505120008',
    masterNo: 'HBL2505120008',
    customer: '纽约电子',
    state: '转运中',
    transport: '海运整箱',
    destination: '美国/纽约',
    pieces: 22,
    weightKg: '14,220.00',
    createdAt: '2025-05-11 15:33',
    version: 8,
  },
  {
    id: 'wb-009',
    waybillNo: 'S2505120009',
    masterNo: 'HBL2505120009',
    customer: '法兰西酒业',
    state: '待收货',
    transport: '空运',
    destination: '法国/巴黎',
    pieces: 4,
    weightKg: '210.50',
    createdAt: '2025-05-11 14:20',
    version: 2,
  },
  {
    id: 'wb-010',
    waybillNo: 'S2505120010',
    masterNo: 'HBL2505120010',
    customer: '里海工程',
    state: '已发货',
    transport: '铁路',
    destination: '哈萨克斯坦/阿拉木图',
    pieces: 15,
    weightKg: '7,800.00',
    createdAt: '2025-05-11 11:05',
    version: 4,
  },
  {
    id: 'wb-011',
    waybillNo: 'S2505120011',
    masterNo: 'HBL2505120011',
    customer: '狮城供应链',
    state: '待分货',
    transport: '海运拼箱',
    destination: '新加坡/新加坡',
    pieces: 6,
    weightKg: '610.00',
    createdAt: '2025-05-11 10:11',
    version: 3,
  },
  {
    id: 'wb-012',
    waybillNo: 'S2505120012',
    masterNo: 'HBL2505120012',
    customer: '首尔贸易',
    state: '已签收',
    transport: '空运',
    destination: '韩国/首尔',
    pieces: 2,
    weightKg: '80.00',
    createdAt: '2025-05-10 21:30',
    version: 11,
  },
];

export interface WaybillFilter {
  query: string;
  state: WaybillStateFilter;
}

export function filterWaybills(records: WaybillListItem[], filter: WaybillFilter) {
  const query = filter.query.trim().toLowerCase();
  return records.filter((record) => {
    const matchesState = filter.state === '全部运单' || record.state === filter.state;
    const matchesQuery =
      !query ||
      `${record.waybillNo}${record.masterNo}${record.customer}${record.destination}`
        .toLowerCase()
        .includes(query);
    return matchesState && matchesQuery;
  });
}

export const waybillStateCounts: { label: WaybillStateFilter; count: number }[] = [
  { label: '全部运单', count: 1248 },
  { label: '待收货', count: 156 },
  { label: '待分货', count: 86 },
  { label: '待转运', count: 97 },
  { label: '转运中', count: 238 },
  { label: '已发货', count: 502 },
  { label: '已签收', count: 1123 },
  { label: '问题件', count: 46 },
];
