import Link from "next/link";
import SiteChrome from "@/components/marketing/SiteChrome";
import { useLanguage } from "@/context/LanguageContext";
import { translations } from "@/lib/marketing/site-copy";

/** Enterprise-minimal homepage — no weekly edition line, no regional/rotating visual blocks. */
export default function HomePage() {
  const { lang } = useLanguage();
  const t = translations[lang];

  return (
    <SiteChrome>
      <main className="rs-week-main rs-week-main--minimal">
        <section id="top" className="rs-section rs-week-hero">
          <div className="rs-container">
            <p className="rs-eyebrow">{t.homeEyebrow}</p>
            <h1 className="rs-h1 rs-week-headline">{t.homeHeadline}</h1>
            <p className="rs-lead">{t.homeLead}</p>
            <div className="rs-hero-ctas">
              <Link href="/pricing" className="rs-btn-accent">
                {t.navPricing}
              </Link>
              <Link href="/services#intake" className="rs-btn-ghost">
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
                <Link href="/pricing" className="rs-btn-accent">
                  {t.homeStripPrimary}
                </Link>
                <Link href="/chat" className="rs-btn-ghost">
                  {t.homeStripSecondary}
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>
    </SiteChrome>
  );
}
