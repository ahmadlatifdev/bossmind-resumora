import React from 'react';
import { createRoot } from 'react-dom/client';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from './lib/firebase';
import Layout from './components/Layout';
import VideosPage from './pages/VideosPage';
import './styles/tokens.css';
import './pricing.css';
import './app-shell.css';

const el = document.getElementById('videos-root');

async function mountWhenAllowed() {
  if (!el) return;

  onAuthStateChanged(auth, (user) => {
    if (!user) {
      window.location.replace('/login?from=/video-library');
      return;
    }
    createRoot(el).render(
      <React.StrictMode>
        <Layout currentPath="/video-library" shell="v6">
          <VideosPage />
        </Layout>
      </React.StrictMode>
    );
  });
}

void mountWhenAllowed();
