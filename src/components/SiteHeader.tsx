import React, { useState } from 'react';
import LanguageSwitcher from './LanguageSwitcher';
import { t } from '../lib/i18n.js';

/**
 * Shared top header — RESUMORA.NET logo top-left → home (/).
 * Nav links center/left; EN/FR/ES language switcher pinned far right.
 * Mobile: hamburger for links; language stays visible on the right.
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
    { href: '/', key: 'nav.home', match: '/' },
    { href: '/pricing', key: 'nav.pricing', match: '/pricing' },
    { href: '/videos', key: 'nav.videos', match: '/videos' },
    { href: '/studio', key: 'nav.studio', match: '/studio' },
    { href: '/account', key: 'nav.account', match: '/account' },
  ];

  const showSwitcher = Boolean(showLang && lang && onLangChange);

  return (
    <header className="app-header site-header" role="banner">
      <a href="/" className="site-logo" aria-label="RESUMORA.NET — Home" title="RESUMORA.NET">
        <img
          className="site-logo__mark"
          src="/resumora-logo.png"
          alt=""
          width={56}
          height={56}
          onError={(e) => {
            e.currentTarget.style.display = 'none';
          }}
        />
        <span className="site-logo__text">RESUMORA.NET</span>
      </a>

      <button
        type="button"
        className="nav-toggle"
        aria-expanded={open}
        aria-controls="site-primary-nav"
        onClick={() => setOpen((v) => !v)}
      >
        {open ? 'Close' : 'Menu'}
      </button>

      <nav
        id="site-primary-nav"
        className={`header-actions main-nav-links${open ? ' is-open' : ''}`}
        aria-label="Primary"
      >
        {links.map((link) => (
          <a
            key={link.href}
            href={link.href}
            aria-current={currentPath === link.match ? 'page' : undefined}
          >
            {t(lang || 'en', link.key)}
          </a>
        ))}
        <a href="/reset-password">{t(lang || 'en', 'nav.reset')}</a>
        {extraLinks}
      </nav>

      {showSwitcher ? (
        <div className="site-header__lang">
          <LanguageSwitcher lang={lang} onChange={onLangChange} />
        </div>
      ) : null}
    </header>
  );
}
