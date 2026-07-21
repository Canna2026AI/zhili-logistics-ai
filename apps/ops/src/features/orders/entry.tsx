import { OpsOrdersWorkspace, type OpsOrdersWorkspaceProps } from './index';

export const opsOrdersFeatureEntry = {
  id: 'ops-orders',
  route: '/operations/orders',
  navigationId: 'waybills',
  createElement(props: OpsOrdersWorkspaceProps = {}) {
    return <OpsOrdersWorkspace {...props} />;
  },
} as const;

export default opsOrdersFeatureEntry;
