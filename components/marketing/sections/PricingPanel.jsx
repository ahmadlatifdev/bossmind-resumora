import { useLanguage } from "@/context/LanguageContext";
import { translations } from "@/lib/marketing/site-copy";
import { useStripeCheckout } from "@/lib/marketing/client-hooks";

export default function PricingPanel() {
  const { lang } = useLanguage();
  const t = translations[lang];
  const { busyPlan, handleCheckout, dynamicPlans } = useStripeCheckout();

  return (
    <section id="pricing" className="rs-section">
      <div className="rs-container">
        <p className="rs-eyebrow">{t.navPricing}</p>
        <h2 className="rs-h2">{t.pricingTitle}</h2>
        <p className="rs-subtitle">{t.pricingSubtitle}</p>
        <div className="rs-pricing-grid">
          {dynamicPlans.map((plan) => (
            <article key={plan.id} className="rs-price-card" data-featured={plan.featured}>
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
