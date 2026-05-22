import Link from "next/link";
import Head from "next/head";
import SiteChrome from "@/components/marketing/SiteChrome";
import PricingPanel from "@/components/marketing/sections/PricingPanel";
import UploadPanel from "@/components/marketing/sections/UploadPanel";
import TrustAuthorityStrip from "@/components/marketing/sections/TrustAuthorityStrip";
import ExecutiveFlowStrip from "@/components/marketing/sections/ExecutiveFlowStrip";
import { useLanguage } from "@/context/LanguageContext";
import { getSiteUrl } from "@/lib/marketing/seo-config";
import { brandAbsoluteUrl } from "@/lib/marketing/branding-assets";
import { translations } from "@/lib/marketing/site-copy";

/** Luxury navy/gold homepage — hero, encrypted intake, pricing, closing strip (EN/FR). */
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
        <section id="top" className="rs-section rs-week-hero rs-week-hero--lux">
          <div className="rs-container rs-hero-lux-wrap rs-hero-lux-wrap--centered">
            <p className="rs-eyebrow">{t.homeEyebrow}</p>
            <h1 className="rs-h1 rs-week-headline">{t.homeHeadline}</h1>
            <p className="rs-lead rs-lead--lux">{t.homeLead}</p>
            <TrustAuthorityStrip variant="hero" />
            <div className="rs-hero-ctas rs-hero-ctas--lux">
              <Link href="/#pricing" className="rs-btn-accent rs-btn-accent--hero">
                {t.navPricing}
              </Link>
              <Link href="/#home-intake" className="rs-btn-ghost">
                {t.heroSecureUpload}
              </Link>
            </div>
          </div>
        </section>

        <ExecutiveFlowStrip />

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
