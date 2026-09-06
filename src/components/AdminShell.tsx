import { FormEvent, useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useAdminAuth } from './AdminAuthGate';
import { t } from '../lib/i18n.js';
import '../admin-master.css';

const LINKS = [
  { to: '/admin/master', key: 'master.nav.overview' },
  { to: '/admin/mission-control', key: 'master.nav.missionControl' },
  { to: '/admin/system-health', key: 'master.nav.health' },
  { to: '/admin/refunds', key: 'master.nav.refunds' },
  { to: '/admin/master#users', key: 'master.nav.users' },
  { to: '/admin/master#orchestration', key: 'master.nav.orchestration' },
  { to: '/admin/master#agents', key: 'master.nav.agents' },
  { to: '/admin/master#hermes-chat', key: 'master.nav.hermesChat' },
  { to: '/admin/master#tasks', key: 'master.nav.tasks' },
  { to: '/admin/financials', key: 'master.nav.financials' },
  { to: '/admin/master#settings', key: 'master.nav.settings' },
] as const;

export default function AdminShell() {
  const { lang, ownerMode, enableOwnerMode, disableOwnerMode } = useAdminAuth();
  const [showOwnerGate, setShowOwnerGate] = useState(false);
  const [ownerPw, setOwnerPw] = useState('');
  const [ownerError, setOwnerError] = useState('');
  const [ownerBusy, setOwnerBusy] = useState(false);

  async function onOwnerSubmit(e: FormEvent) {
    e.preventDefault();
    setOwnerBusy(true);
    setOwnerError('');
    try {
      await enableOwnerMode(ownerPw);
      setOwnerPw('');
      setShowOwnerGate(false);
      window.location.hash = 'orchestration';
    } catch (err) {
      setOwnerError(err instanceof Error ? err.message : t(lang, 'master.ownerUnlockFailed'));
    } finally {
      setOwnerBusy(false);
    }
  }

  function onOwnerToggle() {
    if (ownerMode) {
      disableOwnerMode();
      setShowOwnerGate(false);
      setOwnerError('');
      return;
    }
    setShowOwnerGate(true);
    setOwnerError('');
  }

  return (
    <div className={`admin-master${ownerMode ? ' admin-master--owner' : ''}`}>
      <aside className="admin-master__sidebar" aria-label={t(lang, 'master.sidebarAria')}>
        <p className="admin-master__brand">{t(lang, 'master.brand')}</p>
        <nav className="admin-master__nav">
          <button
            type="button"
            className={`admin-owner-toggle${ownerMode ? ' is-on' : ''}`}
            onClick={onOwnerToggle}
            aria-pressed={ownerMode}
          >
            {ownerMode ? t(lang, 'master.ownerToggleOn') : t(lang, 'master.ownerToggle')}
          </button>
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
          <button
            type="button"
            className={`admin-owner-toggle admin-owner-toggle--bar${ownerMode ? ' is-on' : ''}`}
            onClick={onOwnerToggle}
            aria-pressed={ownerMode}
          >
            {ownerMode ? t(lang, 'master.ownerToggleOn') : t(lang, 'master.ownerToggle')}
          </button>
        </header>
        {showOwnerGate && !ownerMode ? (
          <form className="admin-owner-gate" onSubmit={onOwnerSubmit}>
            <h2>{t(lang, 'master.ownerGateTitle')}</h2>
            <p className="admin-master__lead">{t(lang, 'master.ownerGateLead')}</p>
            <label>
              {t(lang, 'master.ownerPasswordLabel')}
              <input
                type="password"
                value={ownerPw}
                onChange={(e) => setOwnerPw(e.target.value)}
                autoComplete="current-password"
                required
              />
            </label>
            {ownerError ? <p className="admin-master__error">{ownerError}</p> : null}
            <div className="admin-owner-gate__actions">
              <button type="submit" className="admin-master__btn" disabled={ownerBusy}>
                {ownerBusy ? t(lang, 'master.ownerUnlocking') : t(lang, 'master.ownerUnlock')}
              </button>
              <button
                type="button"
                className="admin-master__btn admin-master__btn--ghost"
                disabled={ownerBusy}
                onClick={() => {
                  setShowOwnerGate(false);
                  setOwnerPw('');
                  setOwnerError('');
                }}
              >
                {t(lang, 'master.ownerCancel')}
              </button>
            </div>
          </form>
        ) : null}
        {ownerMode ? (
          <p className="admin-owner-banner" role="status">
            {t(lang, 'master.ownerBanner')}
          </p>
        ) : null}
        <div className="admin-master__content">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
