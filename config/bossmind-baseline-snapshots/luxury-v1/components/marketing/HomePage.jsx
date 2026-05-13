import Link from "next/link";
import Head from "next/head";
import SiteChrome from "@/components/marketing/SiteChrome";
import PricingPanel from "@/components/marketing/sections/PricingPanel";
import TrustMetricsPanel from "@/components/marketing/sections/TrustMetricsPanel";
import UploadPanel from "@/components/marketing/sections/UploadPanel";
import { useLanguage } from "@/context/LanguageContext";
import { getSiteUrl } from "@/lib/marketing/seo-config";
import { brandAbsoluteUrl } from "@/lib/marketing/branding-assets";
import { translations } from "@/lib/marketing/site-copy";

/** Luxury navy/gold homepage — full hero, trust metrics, encrypted intake, pricing, closing strip (EN/FR). */
export default function HomePage() {
  const { lang } = useLanguage();
  const t = translations[lang];
  const siteUrl = getSiteUrl();
  const canonical = `${siteUrl}/`;
  const ogImage = brandAbsoluteUrl(siteUrl, "/og-resumora-brand.png");

  return (
    <SiteChrome>
      <Head>
        <title>{t.homeMetaTitle}</title>
        <meta name="description" content={t.homeMetaDescription} />
        <link rel="canonical" href={canonical} />
        <meta property="og:type" content="website" />
        <meta property="og:site_name" content="Resumora" />
        <meta property="og:title" content={t.homeMetaTitle} />
        <meta property="og:description" content={t.homeMetaDescription} />
        <meta property="og:url" content={canonical} />
        <meta property="og:image" content={ogImage} />
        <meta property="og:locale" content={lang === "fr" ? "fr_FR" : "en_US"} />
        <meta property="og:locale:alternate" content={lang === "fr" ? "en_US" : "fr_FR"} />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={t.homeMetaTitle} />
        <meta name="twitter:description" content={t.homeMetaDescription} />
        <meta name="twitter:image" content={ogImage} />
        <link rel="alternate" hrefLang="en" href={canonical} />
        <link rel="alternate" hrefLang="fr" href={canonical} />
        <link rel="alternate" hrefLang="x-default" href={canonical} />
      </Head>
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
                <h2 className="rs-h2 rs-h2--closing">{t.pricingQuestionsTitle}</h2>
                <p className="rs-subtitle rs-subtitle--strip-tight">{t.pricingQuestionsSubtitle}</p>
              </div>
              <div className="rs-cta-strip-actions rs-cta-strip-actions--loose">
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
