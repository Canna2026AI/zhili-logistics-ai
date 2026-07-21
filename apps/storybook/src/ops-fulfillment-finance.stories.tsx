import type { Meta, StoryObj } from '@storybook/react-vite';
import { FulfillmentFinanceApplication } from '../../../apps/ops/src/features/fulfillment-finance';
import { createInMemoryFulfillmentFinanceCommandPort } from '../../../apps/ops/src/features/fulfillment-finance/in-memory-command-port';

const storyCommandPort = createInMemoryFulfillmentFinanceCommandPort();

const meta = {
  title: '运营端/履约与财务工作台',
  component: FulfillmentFinanceApplication,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof FulfillmentFinanceApplication>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WarehouseReceiving: Story = {
  args: {
    initialSection: 'warehouse',
    initialViewState: 'normal',
    commandPort: storyCommandPort,
  },
};

export const LinehaulLastMile: Story = {
  args: { initialSection: 'linehaul', initialViewState: 'normal', commandPort: storyCommandPort },
};

export const TrackingSupport: Story = {
  args: { initialSection: 'tracking', initialViewState: 'normal', commandPort: storyCommandPort },
};

export const FinanceSettlement: Story = {
  args: { initialSection: 'finance', initialViewState: 'normal', commandPort: storyCommandPort },
};

export const Forbidden: Story = {
  args: { initialSection: 'finance', initialViewState: 'forbidden', commandPort: storyCommandPort },
};

export const StaleVersion: Story = {
  args: { initialSection: 'finance', initialViewState: 'stale', commandPort: storyCommandPort },
};

export const PartialSuccess: Story = {
  args: { initialSection: 'finance', initialViewState: 'partial', commandPort: storyCommandPort },
};
