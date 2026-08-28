import React from 'react';
import { createRoot } from 'react-dom/client';
import StudioPage from './pages/StudioPage';
import { AuthProvider } from './auth/AuthContext';
import StudioAuthGate from './components/StudioAuthGate';
import AuthChrome from './components/AuthChrome';
import './pricing.css';
import './app-shell.css';

const el = document.getElementById('studio-root');
if (el) {
  createRoot(el).render(
    <React.StrictMode>
      <AuthProvider>
        <AuthChrome>
          <StudioAuthGate>
            <StudioPage />
          </StudioAuthGate>
        </AuthChrome>
      </AuthProvider>
    </React.StrictMode>
  );
}
