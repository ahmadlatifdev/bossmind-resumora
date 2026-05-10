import { useEffect, useState } from "react";
import { useLanguage } from "@/context/LanguageContext";
import { QUOTE_STORAGE_KEY } from "@/lib/marketing/service-quote-pricing";
import { SERVICE_LABELS, translations } from "@/lib/marketing/site-copy";
import { useStripeCheckout } from "@/lib/marketing/client-hooks";

export default function PricingPanel() {
  const { lang } = useLanguage();
  const t = translations[lang];
  const { busyPlan, handleCheckout, dynamicPlans } = useStripeCheckout();
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

  const clearSaved = () => {
    try {
      sessionStorage.removeItem(QUOTE_STORAGE_KEY);
    } catch {
      /* ignore */
    }
    setSavedQuote(null);
  };

  return (
    <section id="pricing" className="rs-section">
      <div className="rs-container">
        <p className="rs-eyebrow">{t.navPricing}</p>
        <h2 className="rs-h2">{t.pricingTitle}</h2>
        <p className="rs-subtitle">{t.pricingSubtitle}</p>

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

        <div className="rs-pricing-grid">
          {dynamicPlans.map((plan) => (
            <article
              key={plan.id}
              className="rs-price-card"
              data-featured={plan.featured}
              data-quote-match={savedQuote?.quote?.tier === plan.id ? "true" : "false"}
            >
              {plan.featured ? <span className="rs-price-flag">{t.popular}</span> : null}
              <div>
                <h3 style={{ margin: 0, fontSize: "1.2rem", fontWeight: 800 }}>{plan.name[lang]}</h3>
                <div className="rs-price-amount" style={{ marginTop: "0.35rem" }}>
                  {plan.price}
                  <span style={{ fontSize: "0.95rem", fontWeight: 600, color: "var(--rs-text-muted)" }}>
                    {" "}
                    · {t.pricingOneTimeNote}
                  </span>
                </div>
              </div>
              <ul className="rs-price-features">
                {plan.features[lang].map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
              <button
                type="button"
                className="rs-price-btn"
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
