import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useLanguage } from "@/context/LanguageContext";
import { buildSmartEngagementSurface } from "@/lib/marketing/engagement-signals";
import { SERVICE_LABELS, translations } from "@/lib/marketing/site-copy";

/** Luxury trust / conversion strip — real aggregates when Neon is available, else illustrative pacing (policy-safe). */
export default function EngagementMomentumStrip({ variant = "default" }) {
  const { lang } = useLanguage();
  const t = translations[lang];
  const [pulse, setPulse] = useState(0);
  const [bundle, setBundle] = useState(null);
  const [bundleError, setBundleError] = useState(false);

  useEffect(() => {
    const id = window.setInterval(() => setPulse((p) => (p + 1) % 10_000), 135_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const ac = new AbortController();
    (async () => {
      try {
        const r = await fetch("/api/marketing/public-engagement", {
          signal: ac.signal,
          headers: { accept: "application/json" },
        });
        if (!r.ok) throw new Error(String(r.status));
        const j = await r.json();
        if (!cancelled) setBundle(j);
      } catch {
        if (!cancelled) {
          setBundle(null);
          setBundleError(true);
        }
      }
    })();
    return () => {
      cancelled = true;
      ac.abort();
    };
  }, []);

  const serviceLabels = SERVICE_LABELS[lang] || SERVICE_LABELS.en;

  const e = useMemo(
    () =>
      buildSmartEngagementSurface({
        lang,
        refreshKey: pulse,
        bundle: bundleError ? null : bundle,
        serviceLabels,
      }),
    [lang, pulse, bundle, bundleError, serviceLabels]
  );

  const sessionsMetricLabel =
    e.dataMode === "analytics" ? t.engagementSessionsLabelSignals : t.engagementSessionsLabel;

  const disclaimer =
    e.dataMode === "analytics"
      ? t.engagementDisclaimerAnalytics
      : e.dataMode === "blended"
        ? t.engagementDisclaimerBlended
        : t.engagementSignalsDisclaimer;

  const compact = variant === "compact";

  return (
    <div className={compact ? "rs-engagement-strip rs-engagement-strip--compact" : "rs-engagement-strip"}>
      <div className="rs-engagement-strip-head">
        <p className="rs-engagement-strip-title">{t.engagementStripTitle}</p>
        <div className="rs-engagement-heat" aria-hidden title={t.engagementHeatLabel}>
          {[1, 2, 3].map((lvl) => (
            <span
              key={lvl}
              className={`rs-engagement-heat-bar${lvl <= e.heatLevel ? " rs-engagement-heat-bar--on" : ""}`}
            />
          ))}
        </div>
      </div>

      {(e.popularLabel || e.trendingSecondary) && (
        <div className="rs-engagement-popular-row" aria-label={t.engagementTrending}>
          {e.popularLabel ? (
            <span className="rs-engagement-chip">
              {t.engagementPopularLabel}: <strong>{e.popularLabel}</strong>
            </span>
          ) : null}
          {e.trendingSecondary ? (
            <span className="rs-engagement-chip rs-engagement-chip--trend">{t.engagementTrendingChip}</span>
          ) : null}
        </div>
      )}

      {e.recentSelectionLine ? (
        <p className="rs-engagement-recent-line">
          <span className="rs-engagement-recent-label">{t.engagementRecentlySelected}</span>
          {e.recentSelectionLine}
        </p>
      ) : null}

      <p className="rs-engagement-positive-only">{t.engagementSatisfactionTrust}</p>

      <div className="rs-engagement-metrics">
        <div className="rs-engagement-metric">
          <span className="rs-engagement-metric-label">{sessionsMetricLabel}</span>
          <strong className="rs-engagement-metric-value">{e.sessionsBand}</strong>
        </div>
        <div className="rs-engagement-metric">
          <span className="rs-engagement-metric-label">{t.engagementApprovalLabel}</span>
          <strong className="rs-engagement-metric-value">{e.approvalPct}%</strong>
        </div>
        <div className="rs-engagement-metric">
          <span className="rs-engagement-metric-label">{t.engagementRecommendLabel}</span>
          <strong className="rs-engagement-metric-value">{e.recommendPct}%</strong>
        </div>
      </div>
      <p className="rs-engagement-micro">{e.microSignal}</p>

      <div className="rs-engagement-quote-block">
        {e.verifiedTestimonial ? (
          <p className="rs-engagement-verified-badge">{t.engagementVerifiedReview}</p>
        ) : null}
        <blockquote className="rs-engagement-quote">{e.testimonialLine}</blockquote>
      </div>

      <div className="rs-engagement-micro-cta">
        <Link className="rs-engagement-micro-cta-link" href="/testimonials">
          {t.engagementMicroCtaStories}
        </Link>
        <span className="rs-engagement-micro-cta-sep" aria-hidden>
          ·
        </span>
        <Link className="rs-engagement-micro-cta-link" href="/pricing#pricing">
          {t.engagementMicroCtaPricing}
        </Link>
      </div>

      <p className="rs-engagement-disclaimer">{disclaimer}</p>
    </div>
  );
}
