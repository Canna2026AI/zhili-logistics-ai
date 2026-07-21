import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@zhili/ui/styles.css';
import { FulfillmentFinanceApplication } from './fulfillment-finance-application';

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root');

createRoot(root).render(
  <StrictMode>
    <FulfillmentFinanceApplication />
  </StrictMode>
);
