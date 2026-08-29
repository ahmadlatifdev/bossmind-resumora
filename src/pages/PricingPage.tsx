import React, { useMemo, useState } from 'react';
import { Elements } from '@stripe/react-stripe-js';
import { getStripe, startStripeCheckoutForPlan } from '../lib/stripeCheckout.js';
import {
  SERVICE_PLANS,
  localize,
  rememberSelectedPlan,
  getPlanById,
  readSelectedPlan,
  isStripeTestMode,
} from '../lib/plans.js';
import { t } from '../lib/i18n.js';
import { useLangOptional } from '../i18n/LangContext';

function initialSelectedPlanId() {
  try {
    const params = new URLSearchParams(window.location.search);
    const fromUrl = params.get('plan');
    if (fromUrl && getPlanById(fromUrl)) return fromUrl;
  } catch (_) {
    /* ignore */
  }
  const remembered = readSelectedPlan();
  if (remembered && getPlanById(remembered)) return remembered;
  return SERVICE_PLANS.find((plan) => plan.highlighted)?.id ?? SERVICE_PLANS[0].id;
}

function PlanCard({ plan, lang, selected, busyPlanId, onSelect, onChoose }) {
  const isBusy = busyPlanId === plan.id;
  const name = localize(plan.name, lang);
  const features = localize(plan.features, lang);
  const badge = plan.badge ? localize(plan.badge, lang) : null;
  return (
    <article
      className={`plan-card pricing-plan${plan.highlighted ? ' plan-card--featured' : ''}${selected ? ' plan-card--selected active' : ''}`}
      aria-labelledby={`plan-title-${plan.id}`}
      aria-pressed={selected}
      data-plan-id={plan.id}
      data-price={plan.priceLabel}
      data-stripe-price-id={plan.stripePriceId}
      id={`plan-${plan.stripePriceId}`}
      onClick={() => onSelect(plan.stripePriceId)}
    >
      <div className="plan-card__badge-slot" aria-hidden={badge ? 'false' : 'true'}>
        {badge ? <div className="plan-badge">{badge}</div> : null}
      </div>
      <header className="plan-card__header">
        <h2 id={`plan-title-${plan.id}`}>{name}</h2>
        <div className="plan-price">
          <span className="plan-price-value">{plan.priceLabel}</span>
          <span className="plan-price-interval">{localize(plan.intervalLabel, lang)}</span>
        </div>
        <p className="plan-blurb">{localize(plan.blurb, lang)}</p>
      </header>
      <ul className="plan-features">
        {(Array.isArray(features) ? features : []).map((f) => (
          <li key={`${plan.id}-${f}`}>{f}</li>
        ))}
      </ul>
      <div className="plan-card__footer">
        <button
          type="button"
          className="plan-cta"
          disabled={Boolean(busyPlanId)}
          aria-label={localize(plan.cta, lang)}
          onClick={(event) => {
            event.stopPropagation();
            onSelect(plan.stripePriceId);
            onChoose(plan.stripePriceId);
          }}
        >
          {isBusy ? t(lang, 'pricing.redirecting') : localize(plan.cta, lang)}
        </button>
      </div>
    </article>
  );
}

function ServiceBreakdown({ plan, lang, onCheckout, busy }) {
  if (!plan) return null;
  const name = localize(plan.name, lang);
  const features = localize(plan.features, lang) || [];
  const rows = localize(plan.servicesBreakdown, lang) || [];
  return (
    <section
      className="plan-breakdown"
      aria-live="polite"
      data-selected-plan={plan.id}
      data-selected-price={plan.priceLabel}
    >
      <h3>
        {t(lang, 'pricing.selectedTitle')}: <span>{name}</span>{' '}
        <strong>
          {plan.priceLabel} {localize(plan.intervalLabel, lang)}
        </strong>
      </h3>
      <ul className="plan-breakdown__features" aria-label={`${name} features`}>
        {(Array.isArray(features) ? features : []).map((f) => (
          <li key={`${plan.id}-feat-${f}`}>
            <strong>{f}</strong>
          </li>
        ))}
      </ul>
      <ul className="plan-breakdown__services" aria-label={`${name} services`}>
        {rows.map((row) => (
          <li key={`${plan.id}-svc-${row.title}`}>
            <strong>{row.title}</strong>
            <span>{row.detail}</span>
          </li>
        ))}
      </ul>
      <div className="plan-breakdown-actions">
        <button
          type="button"
          className="primary"
          id="checkout-button-text"
          disabled={busy}
          data-stripe-price-id={plan.stripePriceId}
          onClick={() => onCheckout(plan.stripePriceId)}
        >
          {busy
            ? t(lang, 'pricing.redirecting')
            : `${t(lang, 'pricing.chooseCheckout')} (${plan.priceLabel})`}
        </button>
        <a className="plan-secondary-link" href="/studio">
          {t(lang, 'pricing.continueStudio')}
        </a>
        {plan.id === 'advanced' ? (
          <a className="plan-secondary-link" href="/videos">
            {t(lang, 'pricing.openVideos')}
          </a>
        ) : null}
      </div>
    </section>
  );
}

function PricingInner() {
  const { lang } = useLangOptional();
  const [selectedPlanId, setSelectedPlanId] = useState(initialSelectedPlanId);
  const [busyPlanId, setBusyPlanId] = useState(null);
  const [error, setError] = useState('');
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const checkoutState = params.get('checkout');
  const selectedPlan = useMemo(() => getPlanById(selectedPlanId), [selectedPlanId]);
  const selectedStripePriceId = selectedPlan?.stripePriceId || '';

  function handleSelect(planId) {
    // Selection only changes highlight + breakdown — never mutates SERVICE_PLANS prices/features.
    const plan = getPlanById(planId);
    if (!plan) return;
    setSelectedPlanId(plan.id);
    rememberSelectedPlan(plan.id);
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('plan', plan.id);
      window.history.replaceState({}, '', url.toString());
    } catch (_) {
      /* ignore */
    }
  }

  async function handleChoose(planId) {
    const plan = getPlanById(planId);
    if (!plan || !plan.stripePriceId) {
      setError('Please select a plan first.');
      return;
    }
    setError('');
    handleSelect(plan.id);
    setBusyPlanId(plan.id);
    try {
      await startStripeCheckoutForPlan(plan.id);
    } catch (err) {
      setError(err?.message || 'Unable to start checkout.');
      setBusyPlanId(null);
    }
  }

  return (
    <div className="pricing-page page-content">
      <header className="pricing-hero">
        <p className="pricing-kicker">{t(lang, 'pricing.kicker')}</p>
        <h1>{t(lang, 'pricing.title')}</h1>
        <p className="pricing-sub">{t(lang, 'pricing.sub')}</p>
        <p className="pricing-advisory">{t(lang, 'pricing.advisory')}</p>
      </header>

      {isStripeTestMode() ? (
        <div className="pricing-banner pricing-banner--warn" role="status">
          {t(lang, 'pricing.sandboxBanner')}
        </div>
      ) : null}

      {checkoutState === 'success' ? (
        <div className="pricing-banner pricing-banner--ok" role="status">
          {t(lang, 'pricing.checkoutOk')}
        </div>
      ) : null}
      {checkoutState === 'canceled' ? (
        <div className="pricing-banner pricing-banner--warn" role="status">
          {t(lang, 'pricing.checkoutCancel')}
        </div>
      ) : null}
      {error ? (
        <div className="pricing-banner pricing-banner--err" role="alert">
          {error}
        </div>
      ) : null}

      <section className="plans-grid plans-grid--4" aria-label={t(lang, 'pricing.title')}>
        {SERVICE_PLANS.map((plan) => (
          <PlanCard
            key={plan.id}
            plan={plan}
            lang={lang}
            selected={selectedPlanId === plan.id}
            busyPlanId={busyPlanId}
            onSelect={handleSelect}
            onChoose={handleChoose}
          />
        ))}
      </section>

      <ServiceBreakdown
        key={selectedPlanId}
        plan={selectedPlan}
        lang={lang}
        onCheckout={handleChoose}
        busy={Boolean(busyPlanId)}
      />
      {selectedPlan ? (
        <p
          className="pricing-selected-hint muted small"
          data-plan={selectedPlan.id}
          data-stripe-price-id={selectedStripePriceId}
        >
          {localize(selectedPlan.name, lang)} · {selectedPlan.priceLabel}
        </p>
      ) : null}

      <p className="pricing-foot">
        <a href="/">{t(lang, 'pricing.backHome')}</a>
        {' · '}
        <a href="/reset-password">{t(lang, 'nav.reset')}</a>
      </p>
    </div>
  );
}

export default function PricingPage() {
  const stripePromise = useMemo(() => getStripe().catch(() => null), []);
  return (
    <Elements stripe={stripePromise}>
      <PricingInner />
    </Elements>
  );
}
