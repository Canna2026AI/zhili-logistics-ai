import { OpsOrdersWorkspace, type OpsOrdersWorkspaceProps } from './index';
import type { OpsOrdersPorts } from './ports';

export type OpsOrdersFeatureEntryProps = Omit<OpsOrdersWorkspaceProps, 'ports'> & {
  ports: OpsOrdersPorts;
};

export const opsOrdersFeatureEntry = {
  id: 'ops-orders',
  route: '/operations/orders',
  navigationId: 'waybills',
  createElement(props: OpsOrdersFeatureEntryProps) {
    if (!props?.ports) {
      throw new Error(
        'opsOrdersFeatureEntry requires explicitly injected production or mock ports'
      );
    }
    return <OpsOrdersWorkspace {...props} />;
  },
} as const;

export default opsOrdersFeatureEntry;
