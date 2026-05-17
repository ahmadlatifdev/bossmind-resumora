import Head from "next/head";
import Link from "next/link";
import SiteChrome from "@/components/marketing/SiteChrome";
import PricingPanel from "@/components/marketing/sections/PricingPanel";
import { useLanguage } from "@/context/LanguageContext";
import { getSiteUrl } from "@/lib/marketing/seo-config";
import { brandAbsoluteUrl } from "@/lib/marketing/branding-assets";
import { translations } from "@/lib/marketing/site-copy";

export default function PricingPage() {
  const { lang } = useLanguage();
  const t = translations[lang];
  const siteUrl = getSiteUrl();
  const canonical = `${siteUrl}/pricing`;
  const ogImage = brandAbsoluteUrl(siteUrl, "/og-resumora-brand.png");
  const metaTitle =
    lang === "fr"
      ? "Tarifs · Essential Advanced (110 $) | Resumora"
      : "Pricing · Essential Advanced Résumé Studio | Resumora";
  const metaDescription =
    lang === "fr"
      ? "Quatre paliers : Basic, Essential Advanced (110 $ ATS + CV), Professionnel et Élite. Paiement Stripe sécurisé."
      : "Four tiers: Basic, Essential Advanced ($110 ATS résumé upgrade), Professional, and Elite. Stripe-secure checkout.";

  return (
    <SiteChrome>
      <Head>
        <title>{metaTitle}</title>
        <meta name="description" content={metaDescription} />
        <link rel="canonical" href={canonical} />
        <meta
          name="robots"
          content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1"
        />
        <meta property="og:type" content="website" />
        <meta property="og:site_name" content="Resumora" />
        <meta property="og:title" content={metaTitle} />
        <meta property="og:description" content={metaDescription} />
        <meta property="og:url" content={canonical} />
        <meta property="og:image" content={ogImage} />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={metaTitle} />
        <meta name="twitter:description" content={metaDescription} />
        <meta name="twitter:image" content={ogImage} />
      </Head>
      <main>
        <section className="rs-section rs-pricing-page-hero rs-pricing-page-hero--centered">
          <div className="rs-container">
            <p className="rs-eyebrow">{t.navPricing}</p>
            <h1 className="rs-page-title">{t.pricingTitle}</h1>
            <p className="rs-lead rs-lead--pricing-tight">{t.pricingSubtitle}</p>
            <p className="rs-pricing-trust-line rs-pricing-trust-line--hero">{t.pricingTrustSecureLine}</p>
          </div>
        </section>
        <PricingPanel showHeader={false} />
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
