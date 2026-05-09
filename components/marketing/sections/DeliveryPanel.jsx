import { useLanguage } from "@/context/LanguageContext";
import { processSteps, translations } from "@/lib/marketing/site-copy";

export default function DeliveryPanel() {
  const { lang } = useLanguage();
  const t = translations[lang];
  const steps = processSteps(lang);

  return (
    <section id="delivery-protocols" className="rs-section rs-section-muted">
      <div className="rs-container">
        <p className="rs-eyebrow">{t.navDelivery}</p>
        <h2 className="rs-h2">{t.deliveryProtocolsTitle}</h2>
        <p className="rs-subtitle">{t.deliveryProtocolsSubtitle}</p>
        <div className="rs-delivery-grid">
          {steps.map((s) => {
            const I = s.Icon;
            return (
              <article key={s.step} className="rs-delivery-card">
                <div className="rs-delivery-step">{s.step}</div>
                <div style={{ display: "flex", alignItems: "center", gap: "0.45rem", marginTop: "0.5rem" }}>
                  <I size={22} strokeWidth={1.45} className="rs-icon-gold" aria-hidden />
                  <h3 style={{ margin: 0, fontSize: "1.15rem", fontWeight: 800 }}>{s.title}</h3>
                </div>
                <p className="rs-delivery-desc">{s.detail}</p>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
