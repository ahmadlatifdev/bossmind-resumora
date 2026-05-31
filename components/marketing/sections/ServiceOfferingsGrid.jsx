import Link from "next/link";
import { useLanguage } from "@/context/LanguageContext";
import { getMarketingMessages, getServiceCards } from "@/lib/i18n/marketing-messages";
import { translations } from "@/lib/marketing/site-copy";

export default function ServiceOfferingsGrid({ variant = "capabilities" }) {
  const { lang } = useLanguage();
  const locale = lang === "fr" ? "fr" : "en";
  const t = translations[locale];
  const messages = getMarketingMessages(locale);
  const items = getServiceCards(locale);

  const title =
    variant === "services" ? t.servicesTitle : messages.services.sectionTitle;
  const subtitle = variant === "services" ? t.servicesSubtitle : t.capabilitiesSubtitle;
  const eyebrow = variant === "services" ? t.navServices : t.navCapabilities;

  return (
    <section id={variant === "services" ? "catalogue" : "capabilities"} className="rs-section">
      <div className="rs-container">
        <p className="rs-eyebrow">{eyebrow}</p>
        <h2 className="rs-h2">{title}</h2>
        <p className="rs-subtitle">{subtitle}</p>
        <div className={`rs-card-grid${variant === "capabilities" ? " rs-card-grid--compact" : ""}`}>
          {items.map((item) => {
            const I = item.Icon;
            return (
              <article key={item.key} className="rs-service-card rs-card-interactive">
                <div className="rs-card-title-row">
                  <I size={22} strokeWidth={1.45} className="rs-icon-gold" aria-hidden />
                  <h3>{item.title}</h3>
                </div>
                <p>{item.description}</p>
                <div className="rs-svc-free-row">
                  <Link
                    href={`/free-test?service=${item.resourceKey}`}
                    className="rs-btn-ghost rs-svc-free-test"
                  >
                    {item.cta}
                  </Link>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
