import Link from "next/link";
import SiteChrome from "@/components/marketing/SiteChrome";
import ServiceOfferingsGrid from "@/components/marketing/sections/ServiceOfferingsGrid";
import { useLanguage } from "@/context/LanguageContext";
import { translations } from "@/lib/marketing/site-copy";

export default function CapabilitiesPage() {
  const { lang } = useLanguage();
  const t = translations[lang];

  return (
    <SiteChrome>
      <main>
        <section className="rs-section">
          <div className="rs-container">
            <p className="rs-eyebrow">{t.navCapabilities}</p>
            <h1 className="rs-page-title">{t.capabilitiesTitle}</h1>
            <p className="rs-lead">{t.capabilitiesSubtitle}</p>
            <div className="rs-hero-ctas">
              <Link href="/services#intake" className="rs-btn-accent">
                {t.footerUpload}
              </Link>
              <Link href="/pricing" className="rs-btn-ghost">
                {t.navPricing}
              </Link>
            </div>
          </div>
        </section>
        <ServiceOfferingsGrid variant="capabilities" />
      </main>
    </SiteChrome>
  );
}
