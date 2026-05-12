import { useEffect, useMemo, useState } from "react";
import { useLanguage } from "@/context/LanguageContext";
import { getEngagementSurface } from "@/lib/marketing/engagement-signals";
import { translations } from "@/lib/marketing/site-copy";

/** Luxury trust / conversion strip — banded studio momentum (not live headcount). */
export default function EngagementMomentumStrip({ variant = "default" }) {
  const { lang } = useLanguage();
  const t = translations[lang];
  const [pulse, setPulse] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => setPulse((p) => (p + 1) % 10_000), 135_000);
    return () => window.clearInterval(id);
  }, []);

  const e = useMemo(() => getEngagementSurface(lang, pulse), [lang, pulse]);

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
      <div className="rs-engagement-metrics">
        <div className="rs-engagement-metric">
          <span className="rs-engagement-metric-label">{t.engagementSessionsLabel}</span>
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
      <blockquote className="rs-engagement-quote">{e.testimonialLine}</blockquote>
      <p className="rs-engagement-disclaimer">{t.engagementSignalsDisclaimer}</p>
    </div>
  );
}
