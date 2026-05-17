import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/router";
import { useLanguage } from "@/context/LanguageContext";
import {
  clearPendingCheckoutPlan,
  getPendingCheckoutPlan,
} from "@/lib/marketing/checkout-plan-persistence";
import { QUOTE_STORAGE_KEY } from "@/lib/marketing/service-quote-pricing";
import { pricingComparisonRows, SERVICE_LABELS, translations } from "@/lib/marketing/site-copy";
import { useStripeCheckout } from "@/lib/marketing/client-hooks";
import PriceTierCard from "@/components/marketing/sections/PriceTierCard";

function formatCompareCell(value) {
  if (value === true) return <span className="rs-compare-val rs-compare-val--yes">✓</span>;
  if (value === false) return <span className="rs-compare-val rs-compare-val--no">—</span>;
  if (value === "partial") return <span className="rs-compare-val rs-compare-val--partial">◐</span>;
  return <span className="rs-compare-val">{String(value)}</span>;
}

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
  }, [router.isReady, router.query.continueCheckout, router, dynamicPlans, lang, handleCheckout]);

  const clearSaved = () => {
    try {
      sessionStorage.removeItem(QUOTE_STORAGE_KEY);
    } catch {
      /* ignore */
    }
    setSavedQuote(null);
  };

  return (
    <section
      id="pricing"
      className="rs-section rs-pricing-section"
      data-rs-pricing-ui="20260517-lux-v4"
      data-rs-pricing-order="basic,professional,elite,essential_advanced"
      data-rs-trust-removed="1"
    >
      <div className="rs-container">
        <header className="rs-pricing-header">
          <p className="rs-eyebrow">{t.navPricing}</p>
          <h2 className="rs-h2 rs-pricing-title">{t.pricingTitle}</h2>
          <p className="rs-pricing-hero-lead">{t.pricingSubtitle}</p>
          <p className="rs-pricing-trust-line">{t.pricingTrustSecureLine}</p>
        </header>

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
                <strong>
                  {savedQuote.quote.tier === "basic"
                    ? t.svcTierBasic
                    : savedQuote.quote.tier === "essential_advanced"
                      ? t.svcTierEssentialAdvanced
                      : savedQuote.quote.tier === "elite"
                        ? t.svcTierElite
                        : t.svcTierProfessional}
                </strong>
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

        <div className="rs-pricing-grid rs-pricing-grid--lux">
          {dynamicPlans.map((plan) => (
            <PriceTierCard
              key={plan.id}
              plan={plan}
              lang={lang}
              busyPlan={busyPlan}
              onCheckout={handleCheckout}
              quoteMatch={savedQuote?.quote?.tier === plan.id}
            />
          ))}
        </div>

        <div className="rs-pricing-compare rs-pricing-compare--lux" aria-label={t.pricingCompareHint}>
          <table>
            <thead>
              <tr>
                <th scope="col">{t.pricingCompareHint}</th>
                <th scope="col">{t.svcTierBasic}</th>
                <th scope="col">{t.svcTierProfessional}</th>
                <th scope="col">{t.svcTierElite}</th>
                <th scope="col">{t.svcTierEssentialAdvanced}</th>
              </tr>
            </thead>
            <tbody>
              {pricingComparisonRows.map((row) => (
                <tr key={row.key}>
                  <th scope="row">{row.label[lang]}</th>
                  <td>{formatCompareCell(row.basic)}</td>
                  <td>{formatCompareCell(row.professional)}</td>
                  <td>{formatCompareCell(row.elite)}</td>
                  <td>{formatCompareCell(row.essential_advanced)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
