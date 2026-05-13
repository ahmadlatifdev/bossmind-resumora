import Link from "next/link";
import SiteChrome from "@/components/marketing/SiteChrome";
import PricingPanel from "@/components/marketing/sections/PricingPanel";
import { useLanguage } from "@/context/LanguageContext";
import { translations } from "@/lib/marketing/site-copy";

export default function PricingPage() {
  const { lang } = useLanguage();
  const t = translations[lang];

  return (
    <SiteChrome>
      <main>
        <section className="rs-section rs-pricing-page-hero">
          <div className="rs-container">
            <p className="rs-eyebrow">{t.navPricing}</p>
            <h1 className="rs-page-title">{t.pricingTitle}</h1>
            <p className="rs-lead rs-lead--pricing-tight">{t.pricingSubtitle}</p>
          </div>
        </section>
        <PricingPanel />
        <section className="rs-section">
          <div className="rs-container">
            <div className="rs-cta-strip">
              <div>
                <h2 className="rs-h2 rs-h2--closing">{t.pricingQuestionsTitle}</h2>
                <p className="rs-subtitle rs-subtitle--strip-tight">{t.pricingQuestionsSubtitle}</p>
              </div>
              <div className="rs-cta-strip-actions rs-cta-strip-actions--loose">
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
