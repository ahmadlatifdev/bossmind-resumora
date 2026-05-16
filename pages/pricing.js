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
      ? "Tarifs · Préparation entretien Essential Advanced | Resumora"
      : "Pricing · Essential Advanced Interview Prep | Resumora";
  const metaDescription =
    lang === "fr"
      ? "Paliers CV premium et forfait Essential Advanced (110 $ USD) : simulations d'entretien, vidéos pro, banque Q&R recruteur et conseils succès. Paiement Stripe sécurisé."
      : "Premium résumé tiers plus Essential Advanced ($110): interview simulations, training videos, recruiter Q&A bank, and success playbooks. Stripe-secure checkout.";

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
