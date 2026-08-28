import React from 'react';
import { createRoot } from 'react-dom/client';
import PricingPage from './pages/PricingPage';
import { AuthProvider } from './auth/AuthContext';
import AuthChrome from './components/AuthChrome';
import './pricing.css';
import './app-shell.css';

const rootEl = document.getElementById('pricing-root');
if (rootEl) {
  createRoot(rootEl).render(
    <React.StrictMode>
      <AuthProvider>
        <AuthChrome>
          <PricingPage />
        </AuthChrome>
      </AuthProvider>
    </React.StrictMode>
  );
}
