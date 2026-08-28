import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import BrandLogo from '../components/BrandLogo';
import LanguageSwitcher from '../components/LanguageSwitcher';
import { getLang, setLang, t } from '../lib/i18n.js';
import { trackEvent, trackSelectItem } from '../lib/analytics.js';
import { getSocialLinks, sanitizeSocialUrl } from '../lib/socialLinks.js';

const BILIBILI_ICON = (
  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" width="22" height="22">
    <path
      fill="currentColor"
      d="M5.2 6.4 3.6 4.7l1.3-1.2 2 2h10.2l2-2 1.3 1.2-1.6 1.7H20a1.5 1.5 0 0 1 1.5 1.5v10.1A1.5 1.5 0 0 1 20 19H4a1.5 1.5 0 0 1-1.5-1.5V7.9A1.5 1.5 0 0 1 4 6.4h1.2zm2.6 3.2a1.2 1.2 0 1 0 1.2 1.2 1.2 1.2 0 0 0-1.2-1.2zm7.2 0a1.2 1.2 0 1 0 1.2 1.2 1.2 1.2 0 0 0-1.2-1.2zM7.2 14.2c1.2 1.3 2.7 2 4.8 2s3.6-.7 4.8-2l1 1.1c-1.5 1.6-3.5 2.4-5.8 2.4s-4.3-.8-5.8-2.4z"
    />
  </svg>
);

/** Default campaign params for Bilibili → pricing traffic (GA4). */
const DEFAULT_UTM = Object.freeze({
  utm_source: 'bilibili',
  utm_medium: 'social',
  utm_campaign: 'bilibili_offer',
});

function resolveBilibiliHref() {
  const fromEnv =
    sanitizeSocialUrl(
      (typeof import.meta !== 'undefined' &&
        import.meta.env &&
        (import.meta.env.VITE_SOCIAL_BILIBILI_URL || import.meta.env.VITE_BILIBILI_URL)) ||
        '',
      'bilibili'
    ) || null;
  if (fromEnv) return fromEnv;
  const listed = getSocialLinks().find((l) => l.id === 'bilibili');
  return listed?.href || null;
}

/**
 * Build /pricing CTA with plan + UTM. Preserves inbound utm_* when present.
 * Never embeds Stripe secrets or price IDs in the URL.
 */
export function buildBilibiliPricingHref(planId = 'basic') {
  const url = new URL('/pricing', 'https://resumora.net');
  url.searchParams.set('plan', planId);

  const inbound =
    typeof window !== 'undefined'
      ? new URLSearchParams(window.location.search)
      : new URLSearchParams();

  for (const [key, fallback] of Object.entries(DEFAULT_UTM)) {
    const existing = inbound.get(key);
    url.searchParams.set(key, existing && existing.trim() ? existing.trim() : fallback);
  }
  // Optional content tag for creative variants
  const content = inbound.get('utm_content');
  if (content) url.searchParams.set('utm_content', content.slice(0, 80));

  return `${url.pathname}${url.search}`;
}

/**
 * Mobile-first Bilibili promotional landing — single CTA to Resumora pricing/checkout.
 */
export default function BilibiliOfferPage() {
  const [lang, setLangState] = useState(() => getLang());
  const bilibiliHref = useMemo(() => resolveBilibiliHref(), []);
  const ctaHref = useMemo(() => buildBilibiliPricingHref('basic'), []);

  const onLangChange = (next: string) => {
    setLangState(setLang(next));
  };

  const onCtaClick = () => {
    trackSelectItem('basic', 'Basic');
    trackEvent('bilibili_offer_cta', {
      plan_id: 'basic',
      utm_source: 'bilibili',
      utm_medium: 'social',
      utm_campaign: 'bilibili_offer',
    });
  };

  return (
    <div className="bili-offer v6-shell min-h-screen">
      <div className="v6-mesh" aria-hidden="true" />

      <header className="bili-offer__top">
        <Link to="/" className="bili-offer__logo site-logo" aria-label="Resumora.net">
          <BrandLogo />
        </Link>
        <LanguageSwitcher lang={lang} onChange={onLangChange} />
      </header>

      <main className="bili-offer__main">
        <p className="bili-offer__badge">{t(lang, 'bilibiliOffer.badge')}</p>

        <div className="bili-offer__brand-block" aria-hidden="false">
          <BrandLogo className="bili-offer__hero-logo" />
          <p className="bili-offer__brand-name">RESUMORA</p>
        </div>

        <h1 className="bili-offer__title v6-heading">{t(lang, 'bilibiliOffer.title')}</h1>
        <p className="bili-offer__sub v6-subhead">{t(lang, 'bilibiliOffer.sub')}</p>
        <p className="bili-offer__price">{t(lang, 'bilibiliOffer.priceHint')}</p>

        <a
          className="bili-offer__cta v6-cta"
          href={ctaHref}
          onClick={onCtaClick}
          data-utm-source="bilibili"
          data-plan="basic"
        >
          {t(lang, 'bilibiliOffer.cta')}
        </a>

        {bilibiliHref ? (
          <a
            className="bili-offer__channel"
            href={bilibiliHref}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={t(lang, 'footer.social.bilibili')}
          >
            <span className="bili-offer__channel-icon">{BILIBILI_ICON}</span>
            <span>{t(lang, 'bilibiliOffer.channel')}</span>
          </a>
        ) : (
          <p className="bili-offer__channel-hint">{t(lang, 'bilibiliOffer.channelMissing')}</p>
        )}
      </main>

      <footer className="bili-offer__foot">
        <Link to="/">{t(lang, 'nav.home')}</Link>
        <span aria-hidden="true">·</span>
        <a href="/pricing">{t(lang, 'nav.pricing')}</a>
      </footer>
    </div>
  );
}
