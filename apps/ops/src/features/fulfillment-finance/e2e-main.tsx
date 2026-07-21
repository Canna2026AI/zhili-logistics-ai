import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@zhili/ui/styles.css';
import { FulfillmentFinanceWorkbench } from './fulfillment-finance-workbench';

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root');

createRoot(root).render(
  <StrictMode>
    <FulfillmentFinanceWorkbench />
  </StrictMode>
);
