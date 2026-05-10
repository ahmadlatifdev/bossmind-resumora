import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { useEffect } from "react";
import SiteChrome from "@/components/marketing/SiteChrome";
import { useLanguage } from "@/context/LanguageContext";
import { getWeeklyBundle } from "@/lib/marketing/weekly-content";

/** Homepage: ISO-week marketing — narrative, featured lanes, weekly visuals, CTA (no embedded video). */
export default function WeeklyHomePage({ weekAnchor }) {
  const { lang } = useLanguage();
  const anchorDate = weekAnchor ? new Date(weekAnchor) : undefined;
  const bundle = getWeeklyBundle(lang, anchorDate);
  const L = bundle.labels;

  useEffect(() => {
    fetch("/api/marketing/week-log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ lang }),
    }).catch(() => {});
  }, [bundle.weekId, lang]);

  return (
    <SiteChrome>
      <main className="rs-week-main rs-week-main--minimal">
        <section id="top" className="rs-section rs-week-hero">
          <div className="rs-container">
            <p className="rs-eyebrow">{bundle.theme.kicker}</p>
            <h1 className="rs-h1 rs-week-headline">{bundle.theme.headline}</h1>
            <p className="rs-lead">{bundle.theme.lead}</p>
            <div className="rs-hero-ctas">
              <Link href="/pricing" className="rs-btn-accent">
                {L.primaryCta}
              </Link>
              <Link href="/services#intake" className="rs-btn-ghost">
                {L.heroSecureUpload}
              </Link>
            </div>
            <p className="rs-week-edition">
              {L.edition} · <strong>{bundle.weekId}</strong> · resumora.net
            </p>
          </div>
        </section>

        <section className="rs-section rs-section-muted">
          <div className="rs-container">
            <p className="rs-eyebrow">{L.featured}</p>
            <div className="rs-week-highlight-grid">
              {bundle.highlights.map((h) => (
                <Link key={h.title} href={h.href} className="rs-week-highlight-card">
                  <h2 className="rs-week-card-title">{h.title}</h2>
                  <p className="rs-week-card-body">{h.body}</p>
                  <span className="rs-card-cta">
                    {h.cta}
                    <ArrowRight size={14} aria-hidden />
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </section>

        <section className="rs-section">
          <div className="rs-container">
            <p className="rs-eyebrow">{L.visuals}</p>
            <div className="rs-week-photo-grid">
              {bundle.photos.map((p) => (
                <Link key={p.alt} href={p.href} className="rs-week-photo-card">
                  <div className="rs-week-photo-placeholder" role="img" aria-label={p.alt} />
                  <span className="rs-week-photo-cap">{p.alt}</span>
                </Link>
              ))}
            </div>
          </div>
        </section>

        <section className="rs-section">
          <div className="rs-container">
            <div className="rs-cta-strip rs-cta-strip--compact">
              <div>
                <h2 className="rs-h2 rs-h2-compact">{bundle.cta.title}</h2>
                <p className="rs-subtitle rs-subtitle-tight">{bundle.cta.subtitle}</p>
              </div>
              <div className="rs-cta-strip-actions">
                <Link href={bundle.cta.primaryHref} className="rs-btn-accent">
                  {bundle.cta.primaryLabel}
                </Link>
                <Link href={bundle.cta.secondaryHref} className="rs-btn-ghost">
                  {bundle.cta.secondaryLabel}
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>
    </SiteChrome>
  );
}
