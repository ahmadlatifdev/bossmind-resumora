import Link from "next/link";
import SiteChrome from "@/components/marketing/SiteChrome";
import PricingPanel from "@/components/marketing/sections/PricingPanel";
import TrustMetricsPanel from "@/components/marketing/sections/TrustMetricsPanel";
import { useLanguage } from "@/context/LanguageContext";
import { translations } from "@/lib/marketing/site-copy";

export default function PricingPage() {
  const { lang } = useLanguage();
  const t = translations[lang];

  return (
    <SiteChrome>
      <main>
        <section className="rs-section">
          <div className="rs-container">
            <p className="rs-eyebrow">{t.navPricing}</p>
            <h1 className="rs-page-title">{t.pricingTitle}</h1>
            <p className="rs-lead">{t.pricingSubtitle}</p>
          </div>
        </section>
        <TrustMetricsPanel />
        <PricingPanel />
        <section className="rs-section">
          <div className="rs-container">
            <div className="rs-cta-strip">
              <div>
                <h2 className="rs-h2" style={{ fontSize: "clamp(1.45rem, 2.5vw, 1.85rem)" }}>
                  {t.pricingQuestionsTitle}
                </h2>
                <p className="rs-subtitle" style={{ marginTop: "0.65rem" }}>
                  {t.pricingQuestionsSubtitle}
                </p>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.65rem", justifyContent: "flex-end" }}>
                <Link href="/contact" className="rs-btn-ghost">
                  {t.navContact}
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>
    </SiteChrome>
  );
}
