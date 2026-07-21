import { useMemo } from 'react';
import {
  FulfillmentFinanceWorkbench,
  type FulfillmentFinanceWorkbenchProps,
} from './fulfillment-finance-workbench';
import { createInMemoryFulfillmentFinanceCommandPort } from './in-memory-command-port';
import type { FulfillmentFinanceCommandPort } from './fulfillment-finance-workbench';

type ApplicationProps = Omit<FulfillmentFinanceWorkbenchProps, 'commandPort'> & {
  commandPort?: FulfillmentFinanceCommandPort;
};

/** Final assembly boundary consumed by the Ops router and by end-to-end tests. */
export function FulfillmentFinanceApplication({ commandPort, ...props }: ApplicationProps) {
  const localPort = useMemo(() => createInMemoryFulfillmentFinanceCommandPort(), []);
  return <FulfillmentFinanceWorkbench {...props} commandPort={commandPort ?? localPort} />;
}
