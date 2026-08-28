import React, { type CSSProperties } from 'react';
import LanguageSwitcher from './LanguageSwitcher';
import BrandLogo from './BrandLogo';
import { t } from '../lib/i18n.js';
import { useAuth } from '../auth/AuthContext';

/** Client registration entry → Login page in register mode (used on Pricing after plan select). */
export const CLIENT_REGISTER_HREF = '/login?mode=register';

/** Hard-forced logo + lang layout (Pricing and any showNav=false header). */
const LOGO_LANG_HEADER_STYLE: CSSProperties = {
  display: 'flex',
  width: '100%',
  justifyContent: 'space-between',
  alignItems: 'center',
  position: 'relative',
};

const LANG_TRAILING_STYLE: CSSProperties = {
  marginLeft: 'auto',
  position: 'absolute',
  right: 0,
  top: '50%',
  transform: 'translateY(-50%)',
  flexShrink: 0,
};

/**
 * Shared top header.
 * - Default: logo + optional nav + EN/FR/ES far right (margin-left: auto).
 * - Pricing: pass showNav={false} so header is ONLY logo + language (+ auth).
 */
export default function SiteHeader({
  lang,
  onLangChange,
  currentPath = '',
  showLang = true,
  showNav = true,
  extraLinks = null,
}) {
  const { user, loading, signOut } = useAuth();
  const links = [
    { href: '/', key: 'nav.home', match: '/' },
    { href: '/pricing', key: 'nav.pricing', match: '/pricing' },
    { href: '/videos', key: 'nav.videos', match: '/videos' },
    { href: '/studio', key: 'nav.studio', match: '/studio' },
    { href: '/account', key: 'nav.account', match: '/account' },
  ];
  const code = lang || 'en';
  const logoLangOnly = !showNav;
  const headerClass = [
    'app-header',
    'site-header',
    logoLangOnly ? 'site-header--logo-lang-only' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <header
      className={headerClass}
      role="banner"
      style={logoLangOnly ? LOGO_LANG_HEADER_STYLE : undefined}
    >
      <a href="/" className="site-logo" aria-label="RESUMORA.NET — Home" title="RESUMORA.NET">
        <BrandLogo decorative />
      </a>

      {showNav ? (
        <nav className="header-nav-links main-nav-links" aria-label="Primary">
          {links.map((link) => (
            <a
              key={link.href}
              href={link.href}
              aria-current={currentPath === link.match ? 'page' : undefined}
            >
              {t(code, link.key)}
            </a>
          ))}
          <a href="/reset-password">{t(code, 'nav.reset')}</a>
          {!loading && user ? (
            <button type="button" className="header-nav-link-btn" onClick={() => void signOut()}>
              {t(code, 'nav.signOut')}
            </button>
          ) : (
            <a href={CLIENT_REGISTER_HREF}>{t(code, 'nav.register')}</a>
          )}
          {extraLinks}
        </nav>
      ) : null}

      <div
        className="header-trailing site-header__lang"
        style={logoLangOnly ? LANG_TRAILING_STYLE : undefined}
      >
        {!showNav && !loading ? (
          user ? (
            <button
              type="button"
              className="lang-btn"
              onClick={() => void signOut()}
              style={{ marginRight: 8 }}
            >
              {t(code, 'nav.signOut')}
            </button>
          ) : (
            <a
              href={CLIENT_REGISTER_HREF}
              className="lang-btn"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                textDecoration: 'none',
                marginRight: 8,
              }}
            >
              {t(code, 'nav.register')}
            </a>
          )
        ) : null}
        {showLang && lang && onLangChange ? (
          <LanguageSwitcher lang={lang} onChange={onLangChange} />
        ) : null}
      </div>
    </header>
  );
}
