import { useState } from "react";
import { translations } from "@/lib/marketing/site-copy";

const VISIBLE_FEATURES = 3;

export default function PriceTierCard({ plan, lang, busyPlan, onCheckout, quoteMatch }) {
  const t = translations[lang];
  const features = plan.features[lang] || [];
  const whatsIncluded = plan.whatsIncluded?.[lang] || [];
  const [expanded, setExpanded] = useState(false);
  const [includedOpen, setIncludedOpen] = useState(false);
  const visible = expanded ? features : features.slice(0, VISIBLE_FEATURES);
  const hasMore = features.length > VISIBLE_FEATURES;
  const showWhatsIncluded = plan.id === "essential_advanced" && whatsIncluded.length > 0;

  const showFlagship = plan.badge === "flagship";
  const showBalanced = plan.badge === "balanced";
  const showAdvanced = plan.badge === "advanced";
  const showPopular = plan.id === "professional";

  return (
    <article
      className={`rs-price-card rs-price-card--lux rs-price-card--aligned rs-price-card--${plan.id}`}
      data-featured={plan.featured}
      data-tier={plan.id}
      data-quote-match={quoteMatch ? "true" : "false"}
    >
      <div className="rs-price-flag-row">
        {showFlagship ? <span className="rs-price-flag">{t.badgeBestValue}</span> : null}
        {showBalanced ? <span className="rs-price-flag rs-price-flag--balanced">{t.badgeBalanced}</span> : null}
        {showAdvanced ? <span className="rs-price-flag rs-price-flag--upgrade">{t.badgeEssentialAdvanced}</span> : null}
        {showPopular ? <span className="rs-price-flag rs-price-flag--popular">{t.badgeMostPopular}</span> : null}
      </div>

      <h3 className="rs-price-tier-name">{plan.name[lang]}</h3>

      <div className="rs-price-amount-block">
        <span className="rs-price-amount-value">{plan.price}</span>
        <span className="rs-price-one-time">· {t.pricingOneTimeNote}</span>
      </div>

      <div className="rs-price-tagline-slot">
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
      ) : (
        <span className="rs-price-expand-spacer" aria-hidden />
      )}

      {showWhatsIncluded ? (
        <div className="rs-price-whats-included" data-rs-ea-whats-included="1">
          <button
            type="button"
            className="rs-price-whats-included-toggle"
            onClick={() => setIncludedOpen((v) => !v)}
            aria-expanded={includedOpen}
          >
            {includedOpen ? t.essentialAdvancedWhatsIncludedHide : t.essentialAdvancedWhatsIncluded}
          </button>
          {includedOpen ? (
            <ul className="rs-price-whats-included-list">
              {whatsIncluded.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      <footer className="rs-price-card-footer">
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
      </footer>
    </article>
  );
}
