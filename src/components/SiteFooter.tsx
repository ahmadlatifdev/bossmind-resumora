import { t } from '../lib/i18n.js';

type SiteFooterProps = {
  lang?: string;
};

/**
 * Global footer — SSoT chrome. Must only be rendered from Layout.
 */
export default function SiteFooter({ lang = 'en' }: SiteFooterProps) {
  const year = new Date().getFullYear();
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
        <p className="site-footer__copy">
          © {year} Resumora · {t(lang, 'nav.home')}
        </p>
      </div>
    </footer>
  );
}
