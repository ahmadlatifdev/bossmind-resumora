import Link from "next/link";
import SiteChrome from "@/components/marketing/SiteChrome";
import RegionsPanel from "@/components/marketing/sections/RegionsPanel";
import { useLanguage } from "@/context/LanguageContext";
import { translations } from "@/lib/marketing/site-copy";

export default function GlobalReachPage() {
  const { lang } = useLanguage();
  const t = translations[lang];

  return (
    <SiteChrome>
      <main>
        <section className="rs-section">
          <div className="rs-container">
            <p className="rs-eyebrow">{t.navCountries}</p>
            <h1 className="rs-page-title">{t.countriesTitle}</h1>
            <p className="rs-lead">{t.countriesSubtitle}</p>
            <div className="rs-hero-ctas">
              <Link href="/pricing" className="rs-btn-accent">
                {t.navPricing}
              </Link>
              <Link href="/capabilities" className="rs-btn-ghost">
                {t.navCapabilities}
              </Link>
            </div>
          </div>
        </section>
        <RegionsPanel />
      </main>
    </SiteChrome>
  );
}
