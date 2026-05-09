import Link from "next/link";
import SiteChrome from "@/components/marketing/SiteChrome";
import TestimonialsPanel from "@/components/marketing/sections/TestimonialsPanel";
import { useLanguage } from "@/context/LanguageContext";
import { translations } from "@/lib/marketing/site-copy";

export default function TestimonialsPage() {
  const { lang } = useLanguage();
  const t = translations[lang];

  return (
    <SiteChrome>
      <main>
        <section className="rs-section">
          <div className="rs-container">
            <p className="rs-eyebrow">{t.navTestimonials}</p>
            <h1 className="rs-page-title">{t.testimonialsTitle}</h1>
            <p className="rs-lead">{t.testimonialsSubtitle}</p>
            <div className="rs-hero-ctas">
              <Link href="/pricing" className="rs-btn-accent">
                {t.navPricing}
              </Link>
              <Link href="/contact" className="rs-btn-ghost">
                {t.navContact}
              </Link>
            </div>
          </div>
        </section>
        <TestimonialsPanel />
      </main>
    </SiteChrome>
  );
}
