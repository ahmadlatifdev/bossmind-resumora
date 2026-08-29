import React from 'react';
import { createRoot } from 'react-dom/client';
import Layout from './components/Layout';
import PricingPage from './pages/PricingPage';
import './styles/tokens.css';
import './pricing.css';
import './app-shell.css';

const rootEl = document.getElementById('pricing-root');
if (rootEl) {
  createRoot(rootEl).render(
    <React.StrictMode>
      <Layout currentPath="/pricing" shell="v6">
        <PricingPage />
      </Layout>
    </React.StrictMode>
  );
}
