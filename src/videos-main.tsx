import React from 'react';
import { createRoot } from 'react-dom/client';
import VideosPage from './pages/VideosPage';
import { AuthProvider } from './auth/AuthContext';
import StudioAuthGate from './components/StudioAuthGate';
import AuthChrome from './components/AuthChrome';
import { initAnalytics, trackPageView } from './lib/analytics.js';
import './pricing.css';
import './app-shell.css';

initAnalytics();
trackPageView('/videos');

const el = document.getElementById('videos-root');
if (el) {
  createRoot(el).render(
    <React.StrictMode>
      <AuthProvider>
        <AuthChrome>
          <StudioAuthGate loginFrom="/videos">
            <VideosPage />
          </StudioAuthGate>
        </AuthChrome>
      </AuthProvider>
    </React.StrictMode>
  );
}
