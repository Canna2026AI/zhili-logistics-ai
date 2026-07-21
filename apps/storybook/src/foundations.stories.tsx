import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import {
  AppShell,
  Button,
  DataTable,
  Dialog,
  Drawer,
  Input,
  StatusTag,
  type DataTableColumn,
} from '@zhili/ui';

const meta = {
  title: '智立 UI/核心组件状态',
  parameters: { layout: 'padded' },
} satisfies Meta;

export default meta;
type Story = StoryObj;

export const Buttons: Story = {
  render: () => (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      <Button>提交预报</Button>
      <Button variant="secondary">保存草稿</Button>
      <Button variant="quiet">更多</Button>
      <Button variant="danger">确认反审核</Button>
      <Button loading>提交中</Button>
      <Button disabled>无权限</Button>
    </div>
  ),
};

export const InputsAndStatuses: Story = {
  render: () => (
    <div style={{ width: 420, display: 'grid', gap: 16 }}>
      <Input label="运单号" defaultValue="S2505120004" />
      <Input label="计费重" defaultValue="123.50 kg" error="实重与预报相差 1.50 kg" />
      <div style={{ display: 'flex', gap: 8 }}>
        <StatusTag tone="success">已收货</StatusTag>
        <StatusTag tone="warning">待补资料</StatusTag>
        <StatusTag tone="danger">同步冲突</StatusTag>
      </div>
    </div>
  ),
};

type Row = { id: string; waybill: string; customer: string; weight: string; state: string };
const columns: DataTableColumn<Row>[] = [
  { key: 'waybill', header: '运单号', render: (row) => row.waybill },
  { key: 'customer', header: '客户', render: (row) => row.customer },
  { key: 'weight', header: '计费重', align: 'right', render: (row) => row.weight },
  {
    key: 'state',
    header: '状态',
    render: (row) => <StatusTag tone="success">{row.state}</StatusTag>,
  },
];

export const DenseTable: Story = {
  render: function DenseTableStory() {
    const [selected, setSelected] = useState<string[]>([]);
    return (
      <div style={{ width: 920 }}>
        <DataTable
          ariaLabel="运单列表"
          columns={columns}
          rows={[
            {
              id: '1',
              waybill: 'S2505120004',
              customer: '深圳鑫源贸易有限公司',
              weight: '123.50 kg',
              state: '已收货',
            },
            {
              id: '2',
              waybill: 'S2505120005',
              customer: '广州远航供应链',
              weight: '86.20 kg',
              state: '已收货',
            },
          ]}
          rowKey={(row) => row.id}
          selectedKeys={selected}
          onSelectionChange={setSelected}
        />
      </div>
    );
  },
};

export const Overlays: Story = {
  render: function OverlayStory() {
    const [dialogOpen, setDialogOpen] = useState(false);
    const [drawerOpen, setDrawerOpen] = useState(false);
    return (
      <>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button onClick={() => setDrawerOpen(true)}>打开运单详情</Button>
          <Button variant="danger" onClick={() => setDialogOpen(true)}>
            反审核
          </Button>
        </div>
        <Drawer
          open={drawerOpen}
          title="运单详情"
          subheader={<StatusTag tone="success">已收货</StatusTag>}
          footer={<Button onClick={() => setDrawerOpen(false)}>完成</Button>}
          onOpenChange={setDrawerOpen}
        >
          S2505120004 · 实收 123.50 kg · 0.48 m³
        </Drawer>
        <Dialog
          open={dialogOpen}
          title="反审核账单"
          description="将影响账单 ST202605-0008 已核销金额，请填写原因。"
          footer={<Button variant="danger">确认反审核</Button>}
          onOpenChange={setDialogOpen}
        >
          <Input label="操作原因" placeholder="至少填写 5 个字" />
        </Dialog>
      </>
    );
  },
};

export const OperationsShell: Story = {
  parameters: { layout: 'fullscreen' },
  render: () => (
    <AppShell
      brand="智立科技物流AI系统"
      tenant="智立科技（深圳）有限公司"
      navigation={[
        { label: '运营', items: [{ id: 'dashboard', label: '运营工作台' }] },
        {
          label: '业务',
          items: [
            { id: 'waybills', label: '订单运单' },
            { id: 'warehouse', label: '仓库作业' },
          ],
        },
        { label: '结算', items: [{ id: 'finance', label: '财务结算' }] },
      ]}
      activeNavigationId="waybills"
      tabs={[
        { id: 'home', label: '运营工作台' },
        { id: 'waybills', label: '运单' },
      ]}
      activeTabId="waybills"
    >
      <h1 style={{ margin: 0, fontSize: 24 }}>运单管理</h1>
    </AppShell>
  ),
};
