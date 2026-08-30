import { t } from '../lib/i18n.js';

type SiteFooterProps = {
  lang?: string;
};

type SocialLink = {
  id: string;
  href: string | undefined;
  labelKey: string;
  short: string;
};

function httpHref(value: string | undefined): string | null {
  const raw = String(value || '').trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    return url.href;
  } catch {
    return null;
  }
}

const SOCIAL_DEFS: SocialLink[] = [
  {
    id: 'facebook',
    href: import.meta.env.VITE_SOCIAL_FACEBOOK,
    labelKey: 'footer.social.facebook',
    short: 'FB',
  },
  {
    id: 'instagram',
    href: import.meta.env.VITE_SOCIAL_INSTAGRAM,
    labelKey: 'footer.social.instagram',
    short: 'IG',
  },
  {
    id: 'tiktok',
    href: import.meta.env.VITE_SOCIAL_TIKTOK,
    labelKey: 'footer.social.tiktok',
    short: 'TT',
  },
  {
    id: 'linkedin',
    href: import.meta.env.VITE_SOCIAL_LINKEDIN,
    labelKey: 'footer.social.linkedin',
    short: 'IN',
  },
  {
    id: 'x',
    href: import.meta.env.VITE_SOCIAL_X,
    labelKey: 'footer.social.x',
    short: 'X',
  },
  {
    id: 'youtube',
    href: import.meta.env.VITE_SOCIAL_YOUTUBE,
    labelKey: 'footer.social.youtube',
    short: 'YT',
  },
];

/**
 * Global footer — SSoT chrome. Must only be rendered from Layout.
 */
export default function SiteFooter({ lang = 'en' }: SiteFooterProps) {
  const year = new Date().getFullYear();
  const social = SOCIAL_DEFS.map((item) => ({ ...item, href: httpHref(item.href) })).filter(
    (item): item is SocialLink & { href: string } => Boolean(item.href)
  );

  return (
    <footer className="site-footer" data-ssot="site-footer" role="contentinfo">
      <div className="site-footer__inner">
        <a href="/" className="site-footer__brand" aria-label={t(lang, 'common.brand')}>
          {t(lang, 'common.brand')}
        </a>
        <nav className="site-footer__nav" aria-label={t(lang, 'footer.navAria')}>
          <a href="/pricing">{t(lang, 'nav.pricing')}</a>
          <a href="/video-library">{t(lang, 'nav.videos')}</a>
          <a href="/studio">{t(lang, 'nav.studio')}</a>
          <a href="/account">{t(lang, 'nav.account')}</a>
        </nav>
        {social.length > 0 ? (
          <nav className="site-footer__social" aria-label={t(lang, 'footer.socialNav')}>
            {social.map((item) => (
              <a
                key={item.id}
                className="social-icon"
                href={item.href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={t(lang, item.labelKey)}
              >
                {item.short}
              </a>
            ))}
          </nav>
        ) : (
          <p className="site-footer__social-empty muted small">{t(lang, 'footer.socialEmpty')}</p>
        )}
        <p className="site-footer__copy">
          © {year} Resumora · {t(lang, 'nav.home')}
        </p>
      </div>
    </footer>
  );
}
