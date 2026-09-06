import React, { useState } from 'react';
import LanguageSwitcher from './LanguageSwitcher';
import { t } from '../lib/i18n.js';

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
  const links = [
    { href: '/', key: 'nav.home', match: ['/'] },
    { href: '/pricing', key: 'nav.pricing', match: ['/pricing'] },
    { href: '/video-library', key: 'nav.videos', match: ['/video-library', '/videos'] },
    { href: '/studio', key: 'nav.studio', match: ['/studio', '/resume-studio'] },
    { href: '/account', key: 'nav.account', match: ['/account'] },
  ];

  function isCurrent(match: string[]) {
    return match.some((m) => currentPath === m || (m !== '/' && currentPath.startsWith(m)));
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
        {links.map((link) => (
          <a
            key={link.href}
            href={link.href}
            aria-current={isCurrent(link.match) ? 'page' : undefined}
          >
            {t(lang || 'en', link.key)}
          </a>
        ))}
        <a href="/reset-password">{t(lang || 'en', 'nav.reset')}</a>
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
