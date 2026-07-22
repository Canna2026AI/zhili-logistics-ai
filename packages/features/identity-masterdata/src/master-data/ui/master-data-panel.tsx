import { Button, DataTable, Dialog, Input, StatusTag, type DataTableColumn } from '@zhili/ui';
import { useMemo, useState } from 'react';
import {
  filterMasterData,
  maskPhoneInName,
  masterDataFixtures,
  memoryMasterDataPort,
  type MasterDataPort,
  type MasterDataCategory,
  type MasterDataRecord,
} from '../model/master-data';
import './master-data-panel.css';

export type MasterDataViewState =
  'normal' | 'loading' | 'empty' | 'failed' | 'forbidden' | 'expired';

export interface MasterDataPanelProps {
  state?: MasterDataViewState;
  onCreate?: (record: MasterDataRecord) => void;
  port?: MasterDataPort;
  readOnly?: boolean;
  dataScope?: string;
  maskPhone?: boolean;
}

const categories: MasterDataCategory[] = [
  '客户',
  '联系人',
  '组织',
  '仓库',
  '合作方',
  '币种',
  '费用',
];

export function MasterDataPanel({
  state = 'normal',
  onCreate,
  port = memoryMasterDataPort,
  readOnly = false,
  dataScope = '全租户',
  maskPhone = false,
}: MasterDataPanelProps) {
  const [category, setCategory] = useState<MasterDataCategory>('客户');
  const [query, setQuery] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [creditLimit, setCreditLimit] = useState('500000.00');
  const [paymentTerms, setPaymentTerms] = useState('月结 30 天');
  const [records, setRecords] = useState(masterDataFixtures);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const rows = useMemo(() => {
    if (state === 'empty') return [];
    return filterMasterData(records, query)
      .filter((record) => record.category === category)
      .filter(
        (record) =>
          dataScope === '全租户' || record.branch === dataScope || record.branch === '全租户'
      )
      .map((record) =>
        maskPhone && record.category === '联系人'
          ? { ...record, name: maskPhoneInName(record.name) }
          : record
      );
  }, [category, dataScope, maskPhone, query, records, state]);

  if (state === 'loading')
    return (
      <div className="ops-state" aria-busy="true">
        正在加载主数据…
      </div>
    );
  if (state === 'failed')
    return (
      <div className="ops-state" role="alert">
        主数据加载失败 — 上游服务不可用 — 请重试（请求 MD-260722）
      </div>
    );
  if (state === 'forbidden')
    return (
      <div className="ops-state" role="alert">
        缺少 master-data.read；请向租户管理员申请对应数据范围。
      </div>
    );
  if (state === 'expired')
    return (
      <div className="ops-state" role="alert">
        会话已过期；未保存内容保留，请重新登录后继续。
      </div>
    );

  const columns: DataTableColumn<MasterDataRecord>[] = [
    { key: 'code', header: '编码', width: 150, render: (row) => <strong>{row.code}</strong> },
    { key: 'name', header: '名称', width: 280, render: (row) => row.name },
    { key: 'scope', header: '数据范围 / 说明', render: (row) => row.scope },
    {
      key: 'status',
      header: '状态',
      render: (row) => (
        <StatusTag tone={row.status === '启用' ? 'success' : 'warning'}>{row.status}</StatusTag>
      ),
    },
    { key: 'version', header: '版本', align: 'right', render: (row) => `v${row.version}` },
  ];

  const saveCustomer = async () => {
    setSaving(true);
    setSaveError('');
    try {
      const record = await port.createCustomer({
        name: customerName.trim(),
        scope: dataScope === '全租户' ? '深圳分公司' : dataScope,
        creditLimit,
        paymentTerms,
      });
      setRecords((current) => [...current, record]);
      onCreate?.(record);
      setDialogOpen(false);
      setCustomerName('');
    } catch {
      setSaveError('客户保存失败；数据未写入，请检查版本或重试。');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="master-data" aria-labelledby="master-data-title">
      <header>
        <div>
          <h1 id="master-data-title">主数据</h1>
          <p>客户、联系人、组织、仓库、合作方与结算参考数据</p>
        </div>
        <Button disabled={readOnly} onClick={() => setDialogOpen(true)}>
          新增客户
        </Button>
      </header>
      <div className="master-data__tabs" role="tablist" aria-label="主数据分类">
        {categories.map((item) => (
          <button
            key={item}
            role="tab"
            aria-selected={category === item}
            onClick={() => setCategory(item)}
          >
            {item}
          </button>
        ))}
      </div>
      <div className="master-data__toolbar">
        <input
          aria-label="筛选主数据"
          value={query}
          placeholder="编码、名称或数据范围"
          onChange={(event) => setQuery(event.target.value)}
        />
        <span>版本化发布 · 当前 {rows.length} 条</span>
      </div>
      <DataTable
        ariaLabel={`${category}列表`}
        columns={columns}
        rows={rows}
        rowKey={(row) => row.id}
        emptyState="暂无主数据；可新增或切换分类。"
      />
      <Dialog
        open={dialogOpen}
        title="新增客户"
        description="客户只写入当前租户和深圳分公司数据范围。"
        onOpenChange={setDialogOpen}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDialogOpen(false)}>
              取消
            </Button>
            <Button disabled={!customerName.trim() || saving} onClick={() => void saveCustomer()}>
              {saving ? '保存中…' : '保存客户'}
            </Button>
          </>
        }
      >
        <Input
          label="客户名称"
          value={customerName}
          onChange={(event) => setCustomerName(event.target.value)}
        />
        <Input
          label="信用额度（CNY）"
          value={creditLimit}
          onChange={(event) => setCreditLimit(event.target.value)}
        />
        <Input
          label="付款周期"
          value={paymentTerms}
          onChange={(event) => setPaymentTerms(event.target.value)}
        />
        {saveError ? <p role="alert">{saveError}</p> : null}
      </Dialog>
    </section>
  );
}
