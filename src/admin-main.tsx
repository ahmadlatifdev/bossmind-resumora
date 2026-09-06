import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import AdminAuthGate from './components/AdminAuthGate';
import AdminShell from './components/AdminShell';
import MasterAdminPage from './pages/MasterAdminPage';
import AdminGlobalChatPage from './pages/AdminGlobalChatPage';
import AdminRefundsPage from './pages/AdminRefundsPage';
import AdminSystemHealthPage from './pages/AdminSystemHealth';
import FinancialPage from './pages/FinancialPage';
import { LangProvider } from './i18n/LangContext';
import './index.css';
import './styles/tokens.css';
import './admin-master.css';

document.documentElement.classList.add('dark');
document.documentElement.dataset.theme = 'dark';
document.documentElement.style.colorScheme = 'dark';

function AdminApp() {
  return (
    <LangProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<AdminAuthGate />}>
            <Route element={<AdminShell />}>
              <Route path="/admin/master" element={<MasterAdminPage />} />
              <Route path="/admin/global-chat" element={<AdminGlobalChatPage />} />
              <Route path="/admin/financials" element={<FinancialPage />} />
              <Route path="/admin/refunds" element={<AdminRefundsPage />} />
              <Route path="/admin" element={<Navigate to="/admin/master" replace />} />
              <Route path="/bossmind" element={<Navigate to="/admin/master" replace />} />
            </Route>
            <Route path="/admin/system-health" element={<AdminSystemHealthPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/admin/master" replace />} />
        </Routes>
      </BrowserRouter>
    </LangProvider>
  );
}

const el = document.getElementById('admin-root');
if (el) {
  createRoot(el).render(
    <StrictMode>
      <AdminApp />
    </StrictMode>
  );
}
