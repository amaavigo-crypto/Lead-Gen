import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import './index.css';
import { PwaInstallProvider } from './context/PwaInstallContext';

// Production-only app shell cache. API responses, auth tokens and tenant data are never cached.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  const registerServiceWorker = () => {
    navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' }).catch(() => undefined);
  };
  if (document.readyState === 'complete') registerServiceWorker();
  else window.addEventListener('load', registerServiceWorker, { once: true });
}

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Root element #root was not found');
}

createRoot(rootElement).render(
  <StrictMode>
    <ErrorBoundary>
      <PwaInstallProvider>
        <App />
      </PwaInstallProvider>
    </ErrorBoundary>
  </StrictMode>
);
