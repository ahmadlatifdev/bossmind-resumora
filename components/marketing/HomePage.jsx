import Head from "next/head";
import SiteChrome from "@/components/marketing/SiteChrome";
import PricingPanel from "@/components/marketing/sections/PricingPanel";
import UploadPanel from "@/components/marketing/sections/UploadPanel";
import { useLanguage } from "@/context/LanguageContext";
import { getSiteUrl } from "@/lib/marketing/seo-config";
import { brandAbsoluteUrl } from "@/lib/marketing/branding-assets";
import { translations } from "@/lib/marketing/site-copy";

/** Luxury navy/gold homepage — hero, encrypted intake, pricing (EN/FR). */
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
        <section id="top" className="rs-section rs-week-hero rs-week-hero--lux rs-week-hero--streamlined">
          <div className="rs-container rs-hero-lux-wrap rs-hero-lux-wrap--centered">
            <p className="rs-eyebrow">{t.homeEyebrow}</p>
            <h1 className="rs-h1 rs-week-headline">{t.homeHeadline}</h1>
            <p className="rs-lead rs-lead--lux rs-lead--hero-final">{t.homeLead}</p>
          </div>
        </section>

        <UploadPanel sectionId="home-intake" />
        <PricingPanel />
      </main>
    </SiteChrome>
  );
}
