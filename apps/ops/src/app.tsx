import { useEffect, useMemo, useState, type MouseEvent } from 'react';
import { createZhiliClient } from '@zhili/api-client';
import {
  FulfillmentFinanceApplication,
  type FulfillmentFinanceCommandPort,
  type FulfillmentSection,
} from './features/fulfillment-finance';
import { OpsOrdersWorkspace } from './features/orders';
import {
  createApiOpsOrdersPorts,
  defaultOpsOrdersPorts,
  type OpsOrdersPorts,
} from './features/orders/ports';

type OperationsArea = { id: 'orders' } | { id: 'fulfillment'; section: FulfillmentSection };

export interface AppProps {
  ordersPorts?: OpsOrdersPorts;
  fulfillmentCommandPort?: FulfillmentFinanceCommandPort;
}

const fulfillmentSections = new Set<FulfillmentSection>([
  'warehouse',
  'linehaul',
  'tracking',
  'finance',
]);

function resolveArea(pathname: string): OperationsArea {
  const section = pathname.split('/').filter(Boolean).at(-1);
  if (
    pathname.startsWith('/operations/fulfillment-finance') &&
    fulfillmentSections.has(section as FulfillmentSection)
  ) {
    return { id: 'fulfillment', section: section as FulfillmentSection };
  }
  if (pathname.startsWith('/operations/fulfillment-finance')) {
    return { id: 'fulfillment', section: 'warehouse' };
  }
  return { id: 'orders' };
}

function browserApiBaseUrl() {
  if (typeof document === 'undefined') return 'http://localhost/api/v1';
  return new URL('/api/v1', document.baseURI).toString();
}

export function App({ ordersPorts, fulfillmentCommandPort }: AppProps = {}) {
  const [area, setArea] = useState<OperationsArea>(() => resolveArea(window.location.pathname));
  const explicitMock =
    import.meta.env.DEV && new URLSearchParams(window.location.search).get('mock') === '1';
  const apiPorts = useMemo(
    () => createApiOpsOrdersPorts(createZhiliClient({ baseUrl: browserApiBaseUrl() })),
    []
  );
  const activeOrdersPorts = ordersPorts ?? (explicitMock ? defaultOpsOrdersPorts : apiPorts);
  const query = explicitMock ? '?mock=1' : '';

  useEffect(() => {
    const updateFromHistory = () => setArea(resolveArea(window.location.pathname));
    window.addEventListener('popstate', updateFromHistory);
    return () => window.removeEventListener('popstate', updateFromHistory);
  }, []);

  const navigate = (next: OperationsArea) => {
    const path =
      next.id === 'orders'
        ? '/operations/orders'
        : `/operations/fulfillment-finance/${next.section}`;
    window.history.pushState({}, '', `${path}${query}`);
    setArea(next);
  };

  const follow = (next: OperationsArea) => (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    navigate(next);
  };

  const navigateFromOrders = (id: string) => {
    const mapping: Record<string, FulfillmentSection> = {
      warehouse: 'warehouse',
      booking: 'linehaul',
      'last-mile': 'linehaul',
      tracking: 'tracking',
      finance: 'finance',
    };
    const section = mapping[id];
    if (section) navigate({ id: 'fulfillment', section });
  };

  return (
    <div className="ops-integrated-app">
      <nav className="ops-module-switcher" aria-label="运营模块切换">
        <strong>智立运营中心</strong>
        <a
          href={`/operations/orders${query}`}
          aria-current={area.id === 'orders' ? 'page' : undefined}
          onClick={follow({ id: 'orders' })}
        >
          订单与报价
        </a>
        <a
          href={`/operations/fulfillment-finance/warehouse${query}`}
          aria-current={area.id === 'fulfillment' ? 'page' : undefined}
          onClick={follow({ id: 'fulfillment', section: 'warehouse' })}
        >
          履约与财务
        </a>
      </nav>
      {area.id === 'orders' ? (
        <OpsOrdersWorkspace
          initialPage="dashboard"
          showPermissionController
          ports={activeOrdersPorts}
          onNavigateOutside={navigateFromOrders}
        />
      ) : (
        <FulfillmentFinanceApplication
          key={area.section}
          initialSection={area.section}
          commandPort={fulfillmentCommandPort}
        />
      )}
    </div>
  );
}
