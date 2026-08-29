import React from 'react';
import { createRoot } from 'react-dom/client';
import Layout from './components/Layout';
import ResetPasswordPage from './pages/ResetPasswordPage';
import './styles/tokens.css';
import './pricing.css';
import './app-shell.css';

const el = document.getElementById('reset-root');
if (el) {
  createRoot(el).render(
    <React.StrictMode>
      <Layout currentPath="/reset-password" shell="v6">
        <ResetPasswordPage />
      </Layout>
    </React.StrictMode>
  );
}
