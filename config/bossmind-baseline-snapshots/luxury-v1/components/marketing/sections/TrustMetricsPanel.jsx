import { performanceStats, translations } from "@/lib/marketing/site-copy";
import { useLanguage } from "@/context/LanguageContext";

/** Compact trust row — minimal metrics, no momentum strip (pricing page uses panel without this file). */
export default function TrustMetricsPanel({ sectionId } = {}) {
  const { lang } = useLanguage();
  const t = translations[lang];
  const stats = performanceStats[lang];

  return (
    <section id={sectionId || undefined} className="rs-section rs-section-muted rs-trust-panel--slim">
      <div className="rs-container">
        <p className="rs-eyebrow">{t.navTrust}</p>
        <h2 className="rs-h2 rs-h2--trust-slim">{t.trustTitle}</h2>
        <p className="rs-subtitle rs-subtitle--trust-slim">{t.trustSubtitle}</p>
        <p className="rs-trust-secure-line rs-trust-secure-line--slim">{t.trustSecureDelivery}</p>
        <div className="rs-trust-grid rs-trust-grid--slim">
          {stats.map((s) => (
            <article key={s.label} className="rs-stat-card rs-stat-card--slim">
              <div className="rs-stat-value">{s.value}</div>
              <div className="rs-stat-label">{s.label}</div>
              <p className="rs-stat-detail">{s.detail}</p>
            </article>
          ))}
        </div>
        <p className="rs-trust-strip rs-trust-strip--slim">{t.trustStrip}</p>
      </div>
    </section>
  );
}
