import { performanceStats, translations } from "@/lib/marketing/site-copy";
import { useLanguage } from "@/context/LanguageContext";

export default function TrustMetricsPanel({ sectionId } = {}) {
  const { lang } = useLanguage();
  const t = translations[lang];
  const stats = performanceStats[lang];

  return (
    <section id={sectionId || undefined} className="rs-section rs-section-muted">
      <div className="rs-container">
        <p className="rs-eyebrow">{t.navTrust}</p>
        <h2 className="rs-h2">{t.trustTitle}</h2>
        <p className="rs-subtitle">{t.trustSubtitle}</p>
        <div className="rs-trust-grid">
          {stats.map((s) => (
            <article key={s.label} className="rs-stat-card">
              <div className="rs-stat-value">{s.value}</div>
              <div className="rs-stat-label">{s.label}</div>
              <p className="rs-stat-detail">{s.detail}</p>
            </article>
          ))}
        </div>
        <p className="rs-trust-strip">{t.trustStrip}</p>
      </div>
    </section>
  );
}
