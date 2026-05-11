import Link from "next/link";
import SiteChrome from "@/components/marketing/SiteChrome";
import PricingPanel from "@/components/marketing/sections/PricingPanel";
import TrustMetricsPanel from "@/components/marketing/sections/TrustMetricsPanel";
import UploadPanel from "@/components/marketing/sections/UploadPanel";
import { useLanguage } from "@/context/LanguageContext";
import { translations } from "@/lib/marketing/site-copy";

/** Luxury navy/gold homepage — full hero, trust metrics, encrypted intake, pricing, closing strip (EN/FR). */
export default function HomePage() {
  const { lang } = useLanguage();
  const t = translations[lang];

  return (
    <SiteChrome>
      <main className="rs-week-main">
        <section id="top" className="rs-section rs-week-hero">
          <div className="rs-container">
            <p className="rs-eyebrow">{t.homeEyebrow}</p>
            <h1 className="rs-h1 rs-week-headline">{t.homeHeadline}</h1>
            <p className="rs-lead">{t.homeLead}</p>
            <div className="rs-hero-ctas">
              <Link href="/#pricing" className="rs-btn-accent">
                {t.navPricing}
              </Link>
              <Link href="/#home-intake" className="rs-btn-ghost">
                {t.heroSecureUpload}
              </Link>
            </div>
          </div>
        </section>

        <section className="rs-section rs-section-muted">
          <div className="rs-container">
            <div className="rs-cta-strip rs-cta-strip--compact">
              <div>
                <h2 className="rs-h2 rs-h2-compact">{t.homeStripTitle}</h2>
                <p className="rs-subtitle rs-subtitle-tight">{t.homeStripSubtitle}</p>
              </div>
              <div className="rs-cta-strip-actions">
                <Link href="/capabilities" className="rs-btn-accent">
                  {t.navCapabilities}
                </Link>
                <Link href="/chat" className="rs-btn-ghost">
                  {t.homeStripSecondary}
                </Link>
              </div>
            </div>
          </div>
        </section>

        <TrustMetricsPanel sectionId="trust" />
        <UploadPanel sectionId="home-intake" />
        <PricingPanel />

        <section className="rs-section rs-section-muted">
          <div className="rs-container">
            <div className="rs-cta-strip">
              <div>
                <h2 className="rs-h2" style={{ fontSize: "clamp(1.45rem, 2.5vw, 1.85rem)" }}>
                  {t.pricingQuestionsTitle}
                </h2>
                <p className="rs-subtitle" style={{ marginTop: "0.42rem" }}>
                  {t.pricingQuestionsSubtitle}
                </p>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.65rem", justifyContent: "flex-end" }}>
                <Link href="/services" className="rs-btn-accent">
                  {t.servicesPageTitle}
                </Link>
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
