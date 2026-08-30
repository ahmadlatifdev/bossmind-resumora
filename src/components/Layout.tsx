import type { ReactNode } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { LangProvider, useLang } from '../i18n/LangContext';
import SiteHeader from './SiteHeader';
import SiteFooter from './SiteFooter';
import ClientChat from './ClientChat';
import { AuthProvider } from '../auth/AuthContext';
import '../index.css';
import '../styles/tokens.css';
import '../app-shell.css';
import '../v6-luxury.css';

export type LayoutShell = 'v6' | 'app';

type ChromeProps = {
  currentPath: string;
  shell?: LayoutShell;
  children: ReactNode;
};

function LayoutChrome({ currentPath, shell = 'v6', children }: ChromeProps) {
  const { lang, switchLang } = useLang();

  return (
    <div
      className={
        shell === 'v6' ? 'v6-shell min-h-screen font-sans layout-root' : 'app-shell layout-root'
      }
      data-ssot="layout"
      data-shell={shell}
    >
      {shell === 'v6' ? <div className="v6-mesh" aria-hidden="true" /> : null}
      <SiteHeader lang={lang} onLangChange={switchLang} currentPath={currentPath} />
      <main id="main-content" className="layout-main" data-ssot="layout-main">
        {children}
      </main>
      <ClientChat />
      <SiteFooter lang={lang} />
    </div>
  );
}

type LayoutProps = {
  currentPath?: string;
  shell?: LayoutShell;
  children: ReactNode;
};

/**
 * Master layout — SSoT for header, footer, and EN/FR/ES switcher.
 * Use for multi-entry HTML pages (pricing, studio, videos, reset).
 */
export default function Layout({ currentPath = '/', shell = 'app', children }: LayoutProps) {
  return (
    <LangProvider>
      <AuthProvider>
        <LayoutChrome currentPath={currentPath} shell={shell}>
          {children}
        </LayoutChrome>
      </AuthProvider>
    </LangProvider>
  );
}

/**
 * React Router parent layout — wraps all SPA routes via `<Outlet />`.
 */
export function AppLayout({ shell = 'v6' }: { shell?: LayoutShell }) {
  const location = useLocation();
  return (
    <LangProvider>
      <LayoutChrome currentPath={location.pathname} shell={shell}>
        <Outlet />
      </LayoutChrome>
    </LangProvider>
  );
}
