import { getLang, t } from '../lib/i18n.js';
import { getSocialLinks } from '../lib/socialLinks.js';

const ICON = {
  facebook: (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        fill="currentColor"
        d="M14 8h3V5h-3c-2.2 0-4 1.8-4 4v2H7v3h3v7h3v-7h3l1-3h-4V9c0-.6.4-1 1-1z"
      />
    </svg>
  ),
  instagram: (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        fill="currentColor"
        d="M7 3h10a4 4 0 0 1 4 4v10a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V7a4 4 0 0 1 4-4zm5 4.5A4.5 4.5 0 1 0 16.5 12 4.5 4.5 0 0 0 12 7.5zm6.2-.9a1.1 1.1 0 1 0 1.1 1.1 1.1 1.1 0 0 0-1.1-1.1zM12 9.5A2.5 2.5 0 1 1 9.5 12 2.5 2.5 0 0 1 12 9.5z"
      />
    </svg>
  ),
  tiktok: (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        fill="currentColor"
        d="M14.5 3h2.1c.2 1.6 1.2 3 2.7 3.7v2.2a6.4 6.4 0 0 1-2.7-.7v6.3a5.6 5.6 0 1 1-5.6-5.6c.3 0 .6 0 .9.1v2.4a3.2 3.2 0 1 0 2.3 3.1V3z"
      />
    </svg>
  ),
  x: (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        fill="currentColor"
        d="M4 4h4.2l4 5.4L16.8 4H20l-6.2 7.2L20 20h-4.2l-4.3-5.7L7.2 20H4l6.5-7.6L4 4z"
      />
    </svg>
  ),
  linkedin: (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        fill="currentColor"
        d="M6.5 9.5H4V20h2.5V9.5zM5.2 4A1.6 1.6 0 1 0 5.2 7.2 1.6 1.6 0 0 0 5.2 4zM20 20h-2.5v-5.4c0-1.5-.5-2.5-1.8-2.5-1 0-1.5.7-1.8 1.3-.1.2-.1.5-.1.8V20H11.3s.1-9.3 0-10.5H13.8v1.5c.4-.7 1.3-1.7 3.2-1.7 2.3 0 4 1.5 4 4.8V20z"
      />
    </svg>
  ),
  youtube: (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        fill="currentColor"
        d="M21.6 7.2a2.7 2.7 0 0 0-1.9-1.9C18 5 12 5 12 5s-6 0-7.7.3a2.7 2.7 0 0 0-1.9 1.9A28 28 0 0 0 2 12a28 28 0 0 0 .4 4.8 2.7 2.7 0 0 0 1.9 1.9C6 19 12 19 12 19s6 0 7.7-.3a2.7 2.7 0 0 0 1.9-1.9A28 28 0 0 0 22 12a28 28 0 0 0-.4-4.8zM10 15.5v-7l6 3.5-6 3.5z"
      />
    </svg>
  ),
  bilibili: (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        fill="currentColor"
        d="M5.2 6.4 3.6 4.7l1.3-1.2 2 2h10.2l2-2 1.3 1.2-1.6 1.7H20a1.5 1.5 0 0 1 1.5 1.5v10.1A1.5 1.5 0 0 1 20 19H4a1.5 1.5 0 0 1-1.5-1.5V7.9A1.5 1.5 0 0 1 4 6.4h1.2zm2.6 3.2a1.2 1.2 0 1 0 1.2 1.2 1.2 1.2 0 0 0-1.2-1.2zm7.2 0a1.2 1.2 0 1 0 1.2 1.2 1.2 1.2 0 0 0-1.2-1.2zM7.2 14.2c1.2 1.3 2.7 2 4.8 2s3.6-.7 4.8-2l1 1.1c-1.5 1.6-3.5 2.4-5.8 2.4s-4.3-.8-5.8-2.4z"
      />
    </svg>
  ),
};

/**
 * Site footer with optional social profile links (env-configured).
 * Renders nothing social when no VITE_SOCIAL_* URLs are set.
 */
export default function SiteFooter({ lang: langProp } = {}) {
  const lang = langProp || getLang();
  const links = getSocialLinks();
  const year = new Date().getFullYear();

  return (
    <footer className="site-footer" role="contentinfo">
      <div className="site-footer__inner">
        <p className="site-footer__brand">RESUMORA.NET · {year}</p>
        {links.length > 0 ? (
          <nav className="site-footer__social" aria-label={t(lang, 'footer.socialNav')}>
            {links.map((link) => (
              <a
                key={link.id}
                className="site-footer__social-link"
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={t(lang, link.labelKey)}
                title={t(lang, link.labelKey)}
              >
                {ICON[link.id] || null}
              </a>
            ))}
          </nav>
        ) : (
          <p className="site-footer__hint muted small">{t(lang, 'footer.socialEmpty')}</p>
        )}
      </div>
    </footer>
  );
}
