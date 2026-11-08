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

/** Fallback UI shown if any subtree throws during render (captured by Sentry). */
function AppFallback({ resetError }: { resetError: () => void }) {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '1rem',
        padding: '2rem',
        textAlign: 'center',
        background: '#0a1a3a',
        color: '#f9f5eb',
        fontFamily: 'Montserrat, system-ui, sans-serif',
      }}
    >
      <h1 style={{ margin: 0, fontSize: '1.5rem', letterSpacing: '0.06em' }}>
        Something went wrong
      </h1>
      <p style={{ margin: 0, opacity: 0.85 }}>
        We&apos;ve been notified. Please refresh the page, or try again.
      </p>
      <button
        type="button"
        onClick={resetError}
        style={{
          marginTop: '0.5rem',
          padding: '0.75rem 1.5rem',
          borderRadius: '999px',
          border: 0,
          cursor: 'pointer',
          fontWeight: 700,
          background: 'linear-gradient(135deg, #d4af37, #f4e8c1)',
          color: '#0a1a3a',
        }}
      >
        Try again
      </button>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Sentry.ErrorBoundary fallback={({ resetError }) => <AppFallback resetError={resetError} />}>
      <App />
    </Sentry.ErrorBoundary>
  </StrictMode>
);
