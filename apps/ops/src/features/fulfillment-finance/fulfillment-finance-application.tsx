import { useMemo } from 'react';
import { createZhiliClient } from '@zhili/api-client';
import {
  FulfillmentFinanceWorkbench,
  type FulfillmentFinanceWorkbenchProps,
} from './fulfillment-finance-workbench';
import { createApiFulfillmentFinanceCommandPort } from './api-command-port';
import type { FulfillmentFinanceCommandPort } from './fulfillment-finance-workbench';

type ApplicationProps = Omit<FulfillmentFinanceWorkbenchProps, 'commandPort'> & {
  commandPort?: FulfillmentFinanceCommandPort;
};

function browserApiBaseUrl() {
  if (typeof document === 'undefined') return 'http://localhost/api/v1';
  return new URL('/api/v1', document.baseURI).toString();
}

/** Final assembly boundary consumed by the Ops router and by end-to-end tests. */
export function FulfillmentFinanceApplication({ commandPort, ...props }: ApplicationProps) {
  const apiPort = useMemo(
    () =>
      createApiFulfillmentFinanceCommandPort(createZhiliClient({ baseUrl: browserApiBaseUrl() })),
    []
  );
  return <FulfillmentFinanceWorkbench {...props} commandPort={commandPort ?? apiPort} />;
}
