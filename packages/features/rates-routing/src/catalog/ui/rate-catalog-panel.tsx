import { Button, DataTable, Dialog, Input, StatusTag, type DataTableColumn } from '@zhili/ui';
import { useState } from 'react';
import {
  memoryRateCatalogPort,
  rateCatalogFixture,
  type RateCatalogPort,
  type RateCatalogRecord,
} from '../model/catalog';

export interface RateCatalogPanelProps {
  port?: RateCatalogPort;
  readOnly?: boolean;
}

export function RateCatalogPanel({
  port = memoryRateCatalogPort,
  readOnly = false,
}: RateCatalogPanelProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [rows, setRows] = useState(rateCatalogFixture);
  const [publishing, setPublishing] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const publish = async () => {
    setPublishing(true);
    setError('');
    setMessage('');
    try {
      const result = await port.publish('rate-dhl', 3, reason.trim());
      setRows((current) =>
        current.map((row) =>
          row.id === 'rate-dhl' ? { ...row, version: result.version, status: result.status } : row
        )
      );
      setMessage(`价卡 ${result.version} 已发布；旧报价快照保持不可变。`);
      setDialogOpen(false);
      setReason('');
    } catch {
      setError('发布失败；服务器版本已变化或校验未通过，请刷新后重试。');
    } finally {
      setPublishing(false);
    }
  };
  const columns: DataTableColumn<RateCatalogRecord>[] = [
    { key: 'kind', header: '类型', width: 100, render: (row) => row.kind },
    { key: 'code', header: '编码', width: 180, render: (row) => <strong>{row.code}</strong> },
    { key: 'name', header: '名称', width: 240, render: (row) => row.name },
    { key: 'rule', header: '规则', render: (row) => row.rule },
    { key: 'version', header: '版本', render: (row) => row.version },
    {
      key: 'status',
      header: '状态',
      render: (row) => (
        <StatusTag tone={row.status === '生效' ? 'success' : 'warning'}>{row.status}</StatusTag>
      ),
    },
  ];
  return (
    <section className="master-data">
      <header>
        <div>
          <h1>渠道与价卡</h1>
          <p>产品、分区、价格版本、附加费、限制与客户特殊价</p>
        </div>
        <Button disabled={readOnly} onClick={() => setDialogOpen(true)}>
          发布价卡
        </Button>
      </header>
      {message ? <p role="status">{message}</p> : null}
      <DataTable ariaLabel="渠道价卡目录" columns={columns} rows={rows} rowKey={(row) => row.id} />
      <Dialog
        open={dialogOpen}
        title="发布价卡 v4"
        description="这是影响报价结果的高风险操作。"
        onOpenChange={setDialogOpen}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDialogOpen(false)}>
              取消
            </Button>
            <Button
              disabled={reason.trim().length < 10 || publishing}
              onClick={() => void publish()}
            >
              {publishing ? '发布中…' : '确认发布'}
            </Button>
          </>
        }
      >
        <div className="quote-cost-mask">
          <strong>将影响 12 个客户特殊价与所有新报价</strong>
          <span>当前版本 v3 → v4；正在查看旧报价的用户会收到版本过期提示。</span>
          <span>审计日志：rate-card.publish / 操作人张伟 / 当前租户</span>
        </div>
        <Input
          label="发布原因"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          hint="至少 10 个字；与版本和影响快照一同留存。"
        />
        {error ? <p role="alert">{error}</p> : null}
      </Dialog>
    </section>
  );
}
