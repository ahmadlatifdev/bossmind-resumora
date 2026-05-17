import { useState } from "react";
import { useLanguage } from "@/context/LanguageContext";
import { pricingComparisonRows, translations } from "@/lib/marketing/site-copy";

const TIER_KEYS = ["basic", "professional", "elite", "essential_advanced"];

const TIER_LABELS = {
  basic: "svcTierBasic",
  professional: "svcTierProfessional",
  elite: "svcTierElite",
  essential_advanced: "svcTierEssentialAdvanced",
};

function cellState(value) {
  if (value === true) return "yes";
  if (value === false) return "no";
  if (value === "partial") return "partial";
  return "text";
}

function cellLabel(value) {
  if (value === true) return "✓";
  if (value === false) return "—";
  if (value === "partial") return "◐";
  return String(value);
}

export default function PricingCompareExecutive() {
  const { lang } = useLanguage();
  const t = translations[lang];
  const [expanded, setExpanded] = useState(false);
  const visibleRows = expanded ? pricingComparisonRows : pricingComparisonRows.slice(0, 4);

  return (
    <div className="rs-compare-exec" aria-label={t.pricingCompareTitle}>
      <header className="rs-compare-exec-header">
        <h3 className="rs-compare-exec-title">{t.pricingCompareTitle}</h3>
        <p className="rs-compare-exec-lead">{t.pricingCompareLead}</p>
      </header>

      <div className="rs-compare-exec-tier-labels" aria-hidden>
        <span className="rs-compare-exec-tier-label rs-compare-exec-tier-label--spacer" />
        {TIER_KEYS.map((key) => (
          <span key={key} className={`rs-compare-exec-tier-label rs-compare-exec-tier-label--${key}`}>
            {t[TIER_LABELS[key]]}
          </span>
        ))}
      </div>

      <ul className="rs-compare-exec-rows">
        {visibleRows.map((row) => (
          <li key={row.key} className="rs-compare-exec-row">
            <span className="rs-compare-exec-feature">{row.label[lang]}</span>
            {TIER_KEYS.map((tier) => (
              <span
                key={tier}
                className={`rs-compare-exec-cell rs-compare-exec-cell--${cellState(row[tier])}`}
                title={cellLabel(row[tier])}
              >
                {cellLabel(row[tier])}
              </span>
            ))}
          </li>
        ))}
      </ul>

      {pricingComparisonRows.length > 4 ? (
        <button
          type="button"
          className="rs-compare-exec-toggle"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
        >
          {expanded ? t.pricingCompareCollapse : t.pricingCompareExpand}
        </button>
      ) : null}
    </div>
  );
}
