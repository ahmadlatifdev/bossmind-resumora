import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';
import { app } from './lib/firebase';
import { trackPageView } from './lib/analytics.js';
import { installFetchErrorLogger, installGlobalErrorHandler } from './lib/sharedMemoryClient';

// Ensure Firebase app is initialized for the client bundle
void app;

installGlobalErrorHandler('client');
installFetchErrorLogger('client');

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
