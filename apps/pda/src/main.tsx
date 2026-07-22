import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@zhili/ui/styles.css';
import './styles.css';
import { App } from './app';
import { registerPdaServiceWorker } from './pwa/register-service-worker';
void registerPdaServiceWorker();
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
