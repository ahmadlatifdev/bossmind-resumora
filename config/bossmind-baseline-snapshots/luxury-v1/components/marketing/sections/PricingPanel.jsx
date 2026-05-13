import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/router";
import { useLanguage } from "@/context/LanguageContext";
import {
  clearPendingCheckoutPlan,
  getPendingCheckoutPlan,
} from "@/lib/marketing/checkout-plan-persistence";
import { QUOTE_STORAGE_KEY } from "@/lib/marketing/service-quote-pricing";
import { SERVICE_LABELS, translations } from "@/lib/marketing/site-copy";
import { useStripeCheckout } from "@/lib/marketing/client-hooks";

export default function PricingPanel() {
  const router = useRouter();
  const resumeCheckoutOnce = useRef(false);
  const { lang } = useLanguage();
  const t = translations[lang];
  const { busyPlan, handleCheckout, dynamicPlans, checkoutError } = useStripeCheckout();
  const labels = SERVICE_LABELS[lang];
  const [savedQuote, setSavedQuote] = useState(null);

  useEffect(() => {
    const id = window.setTimeout(() => {
      try {
        const raw = sessionStorage.getItem(QUOTE_STORAGE_KEY);
        setSavedQuote(raw ? JSON.parse(raw) : null);
      } catch {
        setSavedQuote(null);
      }
    }, 0);
    return () => window.clearTimeout(id);
  }, []);

  /* After Register/Login with ?continueCheckout=1 — resume Stripe Checkout for pending tier. */
  useEffect(() => {
    if (!router.isReady || router.query.continueCheckout !== "1") return;
    if (resumeCheckoutOnce.current) return;

    const planId = getPendingCheckoutPlan();
    if (!planId) {
      router.replace({ pathname: "/pricing" }, undefined, { shallow: true });
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const r = await fetch("/api/engagement/stats", { credentials: "same-origin" });
        const d = await r.json();
        if (cancelled) return;
        if (!d?.signedIn) {
          await router.replace({ pathname: "/pricing" }, undefined, { shallow: true });
          return;
        }

        const planMeta = dynamicPlans.find((p) => p.id === planId);
        if (!planMeta) {
          clearPendingCheckoutPlan();
          await router.replace({ pathname: "/pricing" }, undefined, { shallow: true });
          return;
        }

        resumeCheckoutOnce.current = true;
        await router.replace({ pathname: "/pricing" }, undefined, { shallow: true });
        handleCheckout(planId, planMeta.name[lang], planMeta.price.replace(/[^\d]/g, ""));
      } catch {
        /* ignore */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    router.isReady,
    router.query.continueCheckout,
    router,
    dynamicPlans,
    lang,
    handleCheckout,
  ]);

  const clearSaved = () => {
    try {
      sessionStorage.removeItem(QUOTE_STORAGE_KEY);
    } catch {
      /* ignore */
    }
    setSavedQuote(null);
  };

  return (
    <section id="pricing" className="rs-section rs-pricing-section">
      <div className="rs-container">
        <p className="rs-eyebrow">{t.navPricing}</p>
        <h2 className="rs-h2">{t.pricingTitle}</h2>
        <p className="rs-pricing-hero-lead">{t.pricingSubtitle}</p>
        <p className="rs-pricing-elite-hint">{t.pricingEliteHighlight}</p>
        <p className="rs-pricing-trust-line">{t.pricingTrustSecureLine}</p>

        {checkoutError ? (
          <p className="rs-pricing-checkout-msg" role="status">
            {checkoutError}
          </p>
        ) : null}

        {savedQuote?.quote ? (
          <aside className="rs-pricing-saved-quote" aria-live="polite">
            <div className="rs-pricing-saved-quote-inner">
              <p className="rs-pricing-saved-eyebrow">{t.pricingFromConfigurator}</p>
              <p className="rs-pricing-saved-main">
                {labels[savedQuote.serviceKey] || savedQuote.serviceKey} ·{" "}
                <strong>{savedQuote.quote.tier === "basic" ? t.svcTierBasic : savedQuote.quote.tier === "elite" ? t.svcTierElite : t.svcTierProfessional}</strong>
                {" — "}
                <span className="rs-pricing-saved-est">${savedQuote.quote.indicativeTotal}</span>{" "}
                <span className="rs-pricing-saved-muted">({t.svcQuoteEstimated})</span>
              </p>
              <button type="button" className="rs-engage-text rs-pricing-clear" onClick={clearSaved}>
                {t.pricingConfiguratorClear}
              </button>
            </div>
            <p className="rs-pricing-saved-note">{t.svcQuoteStripeNote}</p>
          </aside>
        ) : null}

        <div className="rs-pricing-grid rs-pricing-grid--spaced">
          {dynamicPlans.map((plan) => (
            <article
              key={plan.id}
              className={`rs-price-card rs-price-card--${plan.id}`}
              data-featured={plan.featured}
              data-tier={plan.id}
              data-quote-match={savedQuote?.quote?.tier === plan.id ? "true" : "false"}
            >
              {(plan.badge === "flagship" || plan.badge === "balanced" || plan.id === "professional") && (
                <div className="rs-price-flag-row">
                  {plan.badge === "flagship" ? (
                    <span className="rs-price-flag">{t.badgeBestValue}</span>
                  ) : null}
                  {plan.badge === "balanced" ? (
                    <span className="rs-price-flag rs-price-flag--balanced">{t.badgeBalanced}</span>
                  ) : null}
                  {plan.id === "professional" ? (
                    <span className="rs-price-flag rs-price-flag--popular">{t.badgeMostPopular}</span>
                  ) : null}
                </div>
              )}
              <div>
                <h3 className="rs-price-tier-name">{plan.name[lang]}</h3>
                <div className="rs-price-amount rs-price-amount--spaced">
                  {plan.price}
                  <span className="rs-price-one-time">· {t.pricingOneTimeNote}</span>
                </div>
              </div>
              <ul className="rs-price-features">
                {plan.features[lang].map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
              <button
                type="button"
                className={`rs-price-btn${plan.id === "elite" ? " rs-price-btn--elite" : ""}`}
                disabled={busyPlan === plan.id}
                onClick={() => handleCheckout(plan.id, plan.name[lang], plan.price.replace(/[^\d]/g, ""))}
              >
                {busyPlan === plan.id ? t.processing : t.selectPlan}
              </button>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
