import * as Sentry from '@sentry/react';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';
import { app } from './lib/firebase';
import { trackPageView } from './lib/analytics.js';

// Initialize Sentry error monitoring when a DSN is configured.
const sentryDsn = import.meta.env.VITE_SENTRY_DSN;
if (sentryDsn) {
  Sentry.init({
    dsn: sentryDsn,
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration({
        maskAllText: true,
        blockAllMedia: true,
      }),
    ],
    tracesSampleRate: 1.0,
  });
}

// Ensure Firebase app is initialized for the client bundle
void app;

// V-6 default theme: dark (matches prior dark-mode default before hydration)
document.documentElement.classList.add('dark');
document.documentElement.dataset.theme = 'dark';
document.documentElement.style.colorScheme = 'dark';

trackPageView();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
