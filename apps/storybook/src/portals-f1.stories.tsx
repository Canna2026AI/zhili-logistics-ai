import type { Meta, StoryObj } from '@storybook/react-vite';
import { App as CustomerPortal } from '../../customer-portal/src/app';
import '../../customer-portal/src/styles.css';
import { App as PlatformConsole } from '../../platform/src/app';
import '../../platform/src/styles.css';
import { App as MarketingWebsite } from '../../website/src/app';
import '../../website/src/styles.css';

const meta = {
  title: '智立门户/F1C 完整界面',
  parameters: { layout: 'fullscreen' },
} satisfies Meta;

export default meta;
type Story = StoryObj;

export const 客户工作台: Story = { render: () => <CustomerPortal /> };
export const 平台租户控制台: Story = { render: () => <PlatformConsole /> };
export const 官网深色首屏: Story = { render: () => <MarketingWebsite /> };
