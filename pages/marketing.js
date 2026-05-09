import Link from "next/link";
import SiteChrome from "@/components/marketing/SiteChrome";
import TrustMetricsPanel from "@/components/marketing/sections/TrustMetricsPanel";
import { useLanguage } from "@/context/LanguageContext";
import { getIsoWeekYear, getWeeklyBundle } from "@/lib/marketing/weekly-content";
import { translations } from "@/lib/marketing/site-copy";

export default function MarketingArchivePage() {
  const { lang } = useLanguage();
  const t = translations[lang];
  const bundle = getWeeklyBundle(lang);
  const { year, week } = getIsoWeekYear();

  return (
    <SiteChrome>
      <main>
        <section className="rs-section">
          <div className="rs-container">
            <p className="rs-eyebrow">{t.navWeekly}</p>
            <h1 className="rs-page-title">{t.marketingArchiveTitle}</h1>
            <p className="rs-lead">{t.marketingArchiveSubtitle}</p>
            <p style={{ color: "var(--rs-text-secondary)", lineHeight: 1.7, marginTop: "1rem" }}>
              {lang === "en" ? "Current ISO week:" : "Semaine ISO actuelle:"}{" "}
              <strong>
                {year}-W{String(week).padStart(2, "0")}
              </strong>
              . {lang === "en" ? "Live homepage edition:" : "Édition page d’accueil :"}{" "}
              <strong>{bundle.weekId}</strong>.
            </p>
            <div className="rs-hero-ctas">
              <Link href="/" className="rs-btn-accent">
                resumora.net
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
            <h2 className="rs-h2">{lang === "en" ? "Organic growth stack" : "Stack croissance organique"}</h2>
            <p className="rs-subtitle">
              {lang === "en"
                ? "Short-form content ships only on official YouTube and TikTok channels (nothing embedded here). SEO landing pages and UTMs drive traffic back to resumora.net; scripts run offline—wire API keys in CI to publish."
                : "Les formats courts sont publiés uniquement sur les chaînes YouTube et TikTok officielles (rien d’intégré ici). Les pages SEO et les UTM ramènent le trafic vers resumora.net ; scripts hors-ligne—branchez les clés API en CI pour publier."}
            </p>
            <ul className="rs-footer-links" style={{ marginTop: "1rem" }}>
              <li>
                <Link href="/solutions/ats-resume">SEO · ATS resume</Link>
              </li>
              <li>
                <Link href="/geo/canada">SEO · Canada</Link>
              </li>
            </ul>
          </div>
        </section>
      </main>
    </SiteChrome>
  );
}
