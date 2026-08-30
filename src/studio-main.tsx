import React from 'react';
import { createRoot } from 'react-dom/client';
import Layout from './components/Layout';
import StudioPage from './pages/StudioPage';
import './styles/tokens.css';
import './pricing.css';
import './app-shell.css';
import { trackPageView } from './lib/analytics.js';

trackPageView();

const el = document.getElementById('studio-root');
if (el) {
  createRoot(el).render(
    <React.StrictMode>
      <Layout currentPath="/studio" shell="v6">
        <StudioPage />
      </Layout>
    </React.StrictMode>
  );
}
