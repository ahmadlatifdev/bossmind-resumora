import React, { useState } from 'react';
import LanguageSwitcher from './LanguageSwitcher';
import { t } from '../lib/i18n.js';
import { useAuth } from '../auth/AuthContext';

/**
 * Shared top header — SSoT chrome (single Resumora mark + nav + EN/FR/ES).
 * Brand mark: /resumora-logo.png only. Never third-party platform badges.
 * Render only from Layout — do not duplicate per page.
 */
export default function SiteHeader({
  lang,
  onLangChange,
  currentPath = '',
  showLang = true,
  extraLinks = null,
}) {
  const [open, setOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const { user, loading, signOut } = useAuth();
  const alwaysLinks = [
    { href: '/', key: 'nav.home', match: ['/'] },
    { href: '/pricing', key: 'nav.pricing', match: ['/pricing'] },
    { href: '/studio', key: 'nav.studio', match: ['/studio', '/resume-studio'] },
  ];
  const memberLinks = [
    { href: '/video-library', key: 'nav.videos', match: ['/video-library', '/videos'] },
  ];

  function isCurrent(match: string[]) {
    return match.some((m) => currentPath === m || (m !== '/' && currentPath.startsWith(m)));
  }

  async function handleSignOut() {
    setAccountOpen(false);
    await signOut();
    window.location.href = '/';
  }

  return (
    <header className="app-header site-header" role="banner" data-ssot="site-header">
      <a
        href="/"
        className="site-logo"
        aria-label={t(lang || 'en', 'common.brandHome')}
        title={t(lang || 'en', 'common.brand')}
      >
        <img
          className="site-logo__mark"
          src="/resumora-logo.png"
          alt=""
          width={56}
          height={56}
          decoding="async"
          onError={(e) => {
            e.currentTarget.style.display = 'none';
          }}
        />
        <span className="site-logo__text">{t(lang || 'en', 'common.brand')}</span>
      </a>

      <button
        type="button"
        className="nav-toggle"
        aria-expanded={open}
        aria-controls="site-primary-nav"
        onClick={() => setOpen((v) => !v)}
      >
        {open ? t(lang || 'en', 'nav.close') : t(lang || 'en', 'nav.menu')}
      </button>

      <nav
        id="site-primary-nav"
        className={`header-actions main-nav-links${open ? ' is-open' : ''}`}
        aria-label={t(lang || 'en', 'nav.primaryAria')}
      >
        {alwaysLinks.map((link) => (
          <a
            key={link.href}
            href={link.href}
            aria-current={isCurrent(link.match) ? 'page' : undefined}
          >
            {t(lang || 'en', link.key)}
          </a>
        ))}

        {!loading && user ? (
          <>
            {memberLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                aria-current={isCurrent(link.match) ? 'page' : undefined}
              >
                {t(lang || 'en', link.key)}
              </a>
            ))}
            <div className="account-menu">
              <button
                type="button"
                className="account-menu__trigger"
                aria-expanded={accountOpen}
                aria-haspopup="true"
                onClick={() => setAccountOpen((v) => !v)}
              >
                {t(lang || 'en', 'nav.account')}
                <span className="account-menu__caret" aria-hidden="true">
                  ▾
                </span>
              </button>
              {accountOpen ? (
                <div className="account-menu__dropdown" role="menu">
                  <a href="/account" role="menuitem" onClick={() => setAccountOpen(false)}>
                    Dashboard
                  </a>
                  <button type="button" role="menuitem" onClick={handleSignOut}>
                    {t(lang || 'en', 'nav.signOut')}
                  </button>
                </div>
              ) : null}
            </div>
          </>
        ) : null}

        {!loading && !user ? (
          <>
            <a href="/login" className="nav-login-text">
              Log In
            </a>
            <a href="/studio" className="nav-login">
              Build Resume
            </a>
          </>
        ) : null}

        {extraLinks}
      </nav>

      {showLang && lang && onLangChange ? (
        <div className="site-header__lang">
          <LanguageSwitcher lang={lang} onChange={onLangChange} />
        </div>
      ) : null}
    </header>
  );
}
