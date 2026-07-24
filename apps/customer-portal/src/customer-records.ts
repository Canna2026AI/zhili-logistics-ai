export type CustomerBillingRecord = {
  customerId: string;
  receiptId: string;
  statementId: string;
  statementNo: string;
  statementVersion: number;
  invoiceNo: string;
  amount: string;
  currency: 'CNY';
  period: string;
  status: 'PENDING';
};

export type CustomerExceptionRecord = {
  id: string;
  exceptionNo: string;
  title: string;
  description: string;
  sla: string;
  waybillNo: string;
  auditNo: string;
  latestEvent: string;
  requiredEvidence: string;
  contact: string;
  note: string;
};

export const customerBillingRecords: CustomerBillingRecord[] = [
  {
    customerId: '01JCUSTOMER000000000000001',
    receiptId: '01JRECEIPT0000000000000001',
    statementId: '01JSTATEMENT00000000000001',
    statementNo: 'ST202607-0018',
    statementVersion: 1,
    invoiceNo: 'INV-202607-018',
    amount: '68420.00',
    currency: 'CNY',
    period: '2026-07-01 至 2026-07-15',
    status: 'PENDING',
  },
  {
    customerId: '01JCUSTOMER000000000000001',
    receiptId: '01JRECEIPT0000000000000002',
    statementId: '01JSTATEMENT00000000000002',
    statementNo: 'ST202605-0008',
    statementVersion: 3,
    invoiceNo: 'INV-202607-019',
    amount: '2320.00',
    currency: 'CNY',
    period: '2026-05-01 至 2026-05-31',
    status: 'PENDING',
  },
];

export const customerExceptionRecords: CustomerExceptionRecord[] = [
  {
    id: '01JISSUE00000000000000001',
    exceptionNo: 'EXC-24118',
    title: '收件地址无法定位',
    description: '承运商需要补充园区入口与联系人信息。',
    sla: 'SLA 剩余 1h 26m · 高影响',
    waybillNo: 'SHP-20260721-902',
    auditNo: 'AUD-88420',
    latestEvent: '北京望京站 / 10:42 · 导航无法定位园区入口',
    requiredEvidence: '园区入口照片',
    contact: '李楠 139****8712',
    note: '东门货运通道 B3',
  },
  {
    id: '01JISSUE00000000000000002',
    exceptionNo: 'EXC-24109',
    title: '破损证明缺失',
    description: '承运商需要外箱破损照片与签收备注。',
    sla: 'SLA 剩余 3h 10m',
    waybillNo: 'SHP-20260720-771',
    auditNo: 'AUD-88391',
    latestEvent: '上海虹桥站 / 09:18 · 外包装破损待举证',
    requiredEvidence: '破损照片或 PDF 证明',
    contact: '周航 138****2261',
    note: '外箱右下角挤压，签收时已备注',
  },
  {
    id: '01JISSUE00000000000000003',
    exceptionNo: 'EXC-24087',
    title: '温控记录异常',
    description: '补充冷链温度记录与现场交接说明。',
    sla: 'SLA 剩余 5h 42m',
    waybillNo: 'SHP-20260719-442',
    auditNo: 'AUD-88320',
    latestEvent: '广州白云站 / 08:36 · 温度探针读数中断',
    requiredEvidence: '温控记录文件',
    contact: '王敏 136****9032',
    note: '备用探针记录见附件',
  },
  {
    id: '01JISSUE00000000000000004',
    exceptionNo: 'EXC-24062',
    title: '签收人信息不全',
    description: '补充签收人姓名、联系方式与授权说明。',
    sla: 'SLA 剩余 8h 05m',
    waybillNo: 'SHP-20260718-309',
    auditNo: 'AUD-88274',
    latestEvent: '深圳龙岗站 / 07:55 · 代收人身份待确认',
    requiredEvidence: '签收授权证明',
    contact: '陈宇 135****1077',
    note: '前台代收，授权信息见附件',
  },
];
