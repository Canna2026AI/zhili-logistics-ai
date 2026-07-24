import type { Meta, StoryObj } from '@storybook/react-vite';
import { OpsOrdersWorkspace } from '@zhili/ops/orders';
import { LoginShell, type SessionPort } from '@zhili/feature-identity-masterdata';
import { QuoteWorkbench } from '@zhili/feature-rates-routing';
import { WaybillList } from '@zhili/feature-waybills';

const meta = {
  title: 'F1A/OpsOrders',
  parameters: { layout: 'fullscreen' },
} satisfies Meta;

export default meta;
type Story = StoryObj;

export const DenseWaybillList: Story = {
  render: () => <OpsOrdersWorkspace initialPage="waybills" />,
};

export const OrderQuote: Story = {
  render: () => <OpsOrdersWorkspace initialPage="quotes" />,
};

export const OperationsDashboard: Story = {
  render: () => <OpsOrdersWorkspace initialPage="dashboard" />,
};

export const PermissionSimulation: Story = {
  render: () => <OpsOrdersWorkspace initialPage="waybills" showPermissionController />,
};

const storySession: SessionPort = {
  login: async () => ({
    id: '01JY8Z8F6ME4F0Y9QH2X6D4R7A',
    subjectId: 'usr-zhang',
    tenantId: 'tenant-zhili',
    expiresAt: '2026-07-22T18:00:00+08:00',
    permissionsVersion: 7,
  }),
  refresh: async () => ({
    id: '01JY8Z8F6ME4F0Y9QH2X6D4R7A',
    subjectId: 'usr-zhang',
    tenantId: 'tenant-zhili',
    expiresAt: '2026-07-22T20:00:00+08:00',
    permissionsVersion: 8,
  }),
  reauthenticate: async () => undefined,
  logout: async () => undefined,
};

export const PasswordLogin: Story = {
  render: () => <LoginShell api={storySession} onAuthenticated={() => undefined} />,
};

export const ExplicitStates: Story = {
  parameters: { layout: 'padded' },
  render: () => (
    <div style={{ display: 'grid', gap: 12 }}>
      <WaybillList state="loading" />
      <WaybillList state="empty" />
      <WaybillList state="failed" />
      <WaybillList state="forbidden" />
      <WaybillList state="expired" />
      <WaybillList state="stale" />
      <WaybillList state="partial" />
      <QuoteWorkbench state="forbidden-cost" />
    </div>
  ),
};
