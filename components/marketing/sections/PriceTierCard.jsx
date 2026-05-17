import { useState } from "react";
import { translations } from "@/lib/marketing/site-copy";

const VISIBLE_FEATURES = 3;

export default function PriceTierCard({ plan, lang, busyPlan, onCheckout, quoteMatch }) {
  const t = translations[lang];
  const features = plan.features[lang] || [];
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? features : features.slice(0, VISIBLE_FEATURES);
  const hasMore = features.length > VISIBLE_FEATURES;

  return (
    <article
      className={`rs-price-card rs-price-card--${plan.id}`}
      data-featured={plan.featured}
      data-tier={plan.id}
      data-quote-match={quoteMatch ? "true" : "false"}
    >
      {(plan.badge === "flagship" ||
        plan.badge === "balanced" ||
        plan.badge === "advanced" ||
        plan.id === "professional") && (
        <div className="rs-price-flag-row">
          {plan.badge === "flagship" ? <span className="rs-price-flag">{t.badgeBestValue}</span> : null}
          {plan.badge === "balanced" ? (
            <span className="rs-price-flag rs-price-flag--balanced">{t.badgeBalanced}</span>
          ) : null}
          {plan.badge === "advanced" ? (
            <span className="rs-price-flag rs-price-flag--upgrade">{t.badgeEssentialAdvanced}</span>
          ) : null}
          {plan.id === "professional" ? (
            <span className="rs-price-flag rs-price-flag--popular">{t.badgeMostPopular}</span>
          ) : null}
        </div>
      )}

      <div className="rs-price-card-head">
        <h3 className="rs-price-tier-name">{plan.name[lang]}</h3>
        <div className="rs-price-amount">
          {plan.price}
          <span className="rs-price-one-time">· {t.pricingOneTimeNote}</span>
        </div>
        {plan.id === "essential_advanced" ? (
          <p className="rs-price-tier-tagline">{t.essentialAdvancedTagline}</p>
        ) : null}
      </div>

      <ul className="rs-price-features rs-price-features--compact">
        {visible.map((f) => (
          <li key={f}>{f}</li>
        ))}
      </ul>

      {hasMore ? (
        <button
          type="button"
          className="rs-price-expand"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
        >
          {expanded ? t.pricingHideFeatures : t.pricingViewAllFeatures}
        </button>
      ) : null}

      <button
        type="button"
        className={`rs-price-btn${
          plan.id === "elite"
            ? " rs-price-btn--elite"
            : plan.id === "essential_advanced"
              ? " rs-price-btn--essential-advanced"
              : ""
        }`}
        disabled={busyPlan === plan.id}
        onClick={() => onCheckout(plan.id, plan.name[lang], plan.price.replace(/[^\d]/g, ""))}
      >
        {busyPlan === plan.id ? t.processing : t.selectPlan}
      </button>
    </article>
  );
}
