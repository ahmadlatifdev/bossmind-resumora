import Head from "next/head";
import Link from "next/link";
import SiteChrome from "@/components/marketing/SiteChrome";
import ServiceOfferingsGrid from "@/components/marketing/sections/ServiceOfferingsGrid";
import UploadPanel from "@/components/marketing/sections/UploadPanel";
import { useLanguage } from "@/context/LanguageContext";
import { translations } from "@/lib/marketing/site-copy";

export default function ServicesPage() {
  const { lang } = useLanguage();
  const t = translations[lang];

  return (
    <SiteChrome>
      <Head>
        <meta
          name="robots"
          content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1"
        />
      </Head>
      <main>
        <section className="rs-section">
          <div className="rs-container">
            <p className="rs-eyebrow">{t.navServices}</p>
            <h1 className="rs-page-title">{t.servicesPageTitle}</h1>
            <p className="rs-lead">{t.servicesPageSubtitle}</p>
            <div className="rs-hero-ctas">
              <Link href="/pricing" className="rs-btn-accent">
                {t.navPricing}
              </Link>
              <Link href="/capabilities" className="rs-btn-ghost">
                {t.navCapabilities}
              </Link>
              <Link href="/services#intake" className="rs-btn-ghost">
                {t.footerUpload}
              </Link>
            </div>
          </div>
        </section>
        <UploadPanel />
        <ServiceOfferingsGrid variant="services" />
      </main>
    </SiteChrome>
  );
}
