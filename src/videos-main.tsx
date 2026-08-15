import React from 'react';
import { createRoot } from 'react-dom/client';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from './lib/firebase';
import VideosPage from './pages/VideosPage';
import './pricing.css';
import './app-shell.css';

const el = document.getElementById('videos-root');

async function mountWhenAllowed() {
  if (!el) return;

  onAuthStateChanged(auth, (user) => {
    if (!user) {
      window.location.replace('/login?from=/videos');
      return;
    }
    createRoot(el).render(
      <React.StrictMode>
        <VideosPage />
      </React.StrictMode>
    );
  });
}

void mountWhenAllowed();
