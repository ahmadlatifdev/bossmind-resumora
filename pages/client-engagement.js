import Link from "next/link";
import SiteChrome from "@/components/marketing/SiteChrome";
import EngagementPanel from "@/components/marketing/sections/EngagementPanel";
import { useLanguage } from "@/context/LanguageContext";
import { translations } from "@/lib/marketing/site-copy";

export default function ClientEngagementPage() {
  const { lang } = useLanguage();
  const t = translations[lang];

  return (
    <SiteChrome>
      <main>
        <section className="rs-section">
          <div className="rs-container">
            <p className="rs-eyebrow">{t.navEngagement}</p>
            <h1 className="rs-page-title">{t.engagementTitle}</h1>
            <p className="rs-lead">{t.engagementSubtitle}</p>
            <div className="rs-hero-ctas">
              <Link href="/register" className="rs-btn-accent">
                {t.navRegister}
              </Link>
              <Link href="/capabilities" className="rs-btn-ghost">
                {t.navCapabilities}
              </Link>
            </div>
          </div>
        </section>
        <EngagementPanel />
      </main>
    </SiteChrome>
  );
}
