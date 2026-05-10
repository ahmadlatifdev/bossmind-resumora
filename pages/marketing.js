import Link from "next/link";
import SiteChrome from "@/components/marketing/SiteChrome";
import TrustMetricsPanel from "@/components/marketing/sections/TrustMetricsPanel";
import { useLanguage } from "@/context/LanguageContext";
import { getIsoWeekYear, getWeeklyBundle } from "@/lib/marketing/weekly-content";
import { translations } from "@/lib/marketing/site-copy";

export async function getStaticProps() {
  return {
    props: {
      weekAnchor: new Date().toISOString(),
    },
    revalidate: 3600,
  };
}

export default function MarketingArchivePage({ weekAnchor }) {
  const { lang } = useLanguage();
  const t = translations[lang];
  const anchorDate = weekAnchor ? new Date(weekAnchor) : undefined;
  const bundle = getWeeklyBundle(lang, anchorDate);
  const { year, week } = getIsoWeekYear(anchorDate);

  return (
    <SiteChrome>
      <main>
        <section className="rs-section">
          <div className="rs-container">
            <p className="rs-eyebrow">{t.navWeekly}</p>
            <h1 className="rs-page-title">{t.marketingArchiveTitle}</h1>
            <p className="rs-lead">{t.marketingArchiveSubtitle}</p>
            <p style={{ color: "var(--rs-text-secondary)", lineHeight: 1.7, marginTop: "1rem" }}>
              {t.marketingIsoWeekLabel}{" "}
              <strong>
                {year}-W{String(week).padStart(2, "0")}
              </strong>
              . {t.marketingLiveEditionLabel}{" "}
              <strong>{bundle.weekId}</strong>.
            </p>
            <div className="rs-hero-ctas">
              <Link href="/" className="rs-btn-accent">
                {t.footerHomeCta}
              </Link>
              <Link href="/pricing" className="rs-btn-ghost">
                {t.navPricing}
              </Link>
            </div>
          </div>
        </section>
        <TrustMetricsPanel />
        <section className="rs-section rs-section-muted">
          <div className="rs-container">
            <h2 className="rs-h2">{t.marketingOrganicTitle}</h2>
            <p className="rs-subtitle">{t.marketingOrganicSubtitle}</p>
            <ul className="rs-footer-links" style={{ marginTop: "1rem" }}>
              <li>
                <Link href="/solutions/ats-resume">{t.marketingSeoLinkAts}</Link>
              </li>
              <li>
                <Link href="/geo/canada">{t.marketingSeoLinkCanada}</Link>
              </li>
            </ul>
          </div>
        </section>
      </main>
    </SiteChrome>
  );
}
