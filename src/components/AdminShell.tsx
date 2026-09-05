import { NavLink, Outlet } from 'react-router-dom';
import LanguageSwitcher from './LanguageSwitcher';
import { useAdminAuth } from './AdminAuthGate';
import { t } from '../lib/i18n.js';
import '../admin-master.css';

const LINKS = [
  { to: '/admin/master', key: 'master.nav.overview' },
  { to: '/admin/system-health', key: 'master.nav.health' },
  { to: '/admin/refunds', key: 'master.nav.refunds' },
  { to: '/admin/master#users', key: 'master.nav.users' },
  { to: '/admin/master#orchestration', key: 'master.nav.orchestration' },
  { to: '/admin/master#agents', key: 'master.nav.agents' },
  { to: '/admin/master#hermes-chat', key: 'master.nav.hermesChat' },
  { to: '/admin/master#tasks', key: 'master.nav.tasks' },
  { to: '/admin/master#settings', key: 'master.nav.settings' },
] as const;

export default function AdminShell() {
  const { lang, setLangCode } = useAdminAuth();

  return (
    <div className="admin-master">
      <aside className="admin-master__sidebar" aria-label={t(lang, 'master.sidebarAria')}>
        <p className="admin-master__brand">{t(lang, 'master.brand')}</p>
        <nav className="admin-master__nav">
          {LINKS.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              className={({ isActive }) =>
                `admin-master__nav-link${isActive && !link.to.includes('#') ? ' is-active' : ''}`
              }
            >
              {t(lang, link.key)}
            </NavLink>
          ))}
          <a
            className="admin-master__nav-link"
            href="/admin-dashboard.html"
            target="_blank"
            rel="noreferrer"
          >
            {t(lang, 'master.nav.cockpit')}
          </a>
        </nav>
      </aside>
      <div className="admin-master__main-wrap">
        <header className="admin-master__top">
          <h1 className="admin-master__page-title">{t(lang, 'master.title')}</h1>
          <LanguageSwitcher lang={lang} onChange={setLangCode} />
        </header>
        <div className="admin-master__content">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
