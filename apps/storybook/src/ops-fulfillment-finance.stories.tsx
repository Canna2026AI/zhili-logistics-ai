import type { Meta, StoryObj } from '@storybook/react-vite';
import { FulfillmentFinanceApplication } from '../../../apps/ops/src/features/fulfillment-finance';

const meta = {
  title: '运营端/履约与财务工作台',
  component: FulfillmentFinanceApplication,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof FulfillmentFinanceApplication>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WarehouseReceiving: Story = {
  args: { initialSection: 'warehouse', initialViewState: 'normal' },
};

export const LinehaulLastMile: Story = {
  args: { initialSection: 'linehaul', initialViewState: 'normal' },
};

export const TrackingSupport: Story = {
  args: { initialSection: 'tracking', initialViewState: 'normal' },
};

export const FinanceSettlement: Story = {
  args: { initialSection: 'finance', initialViewState: 'normal' },
};

export const Forbidden: Story = {
  args: { initialSection: 'finance', initialViewState: 'forbidden' },
};

export const StaleVersion: Story = {
  args: { initialSection: 'finance', initialViewState: 'stale' },
};

export const PartialSuccess: Story = {
  args: { initialSection: 'finance', initialViewState: 'partial' },
};
