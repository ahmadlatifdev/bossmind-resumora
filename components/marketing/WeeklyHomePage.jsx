import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Crown } from "lucide-react";
import { useEffect } from "react";
import SiteChrome from "@/components/marketing/SiteChrome";
import { useLanguage } from "@/context/LanguageContext";
import { getWeeklyBundle } from "@/lib/marketing/weekly-content";

/** Homepage: ISO-week marketing only — narrative, featured lanes, weekly visuals, video, CTA. */
export default function WeeklyHomePage() {
  const { lang } = useLanguage();
  const bundle = getWeeklyBundle(lang);

  useEffect(() => {
    fetch("/api/marketing/week-log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ lang }),
    }).catch(() => {});
  }, [bundle.weekId, lang]);

  const L = bundle.labels;

  return (
    <SiteChrome>
      <main className="rs-week-main rs-week-main--minimal">
        <section id="top" className="rs-section rs-week-hero">
          <div className="rs-container">
            <p className="rs-eyebrow" style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
              <Crown size={14} strokeWidth={1.5} className="rs-icon-gold" aria-hidden />
              {bundle.theme.kicker}
            </p>
            <h1 className="rs-h1 rs-week-headline">{bundle.theme.headline}</h1>
            <p className="rs-lead">{bundle.theme.lead}</p>
            <div className="rs-hero-ctas">
              <Link href="/pricing" className="rs-btn-accent">
                {L.primaryCta}
              </Link>
              <Link href="/services#intake" className="rs-btn-ghost">
                {lang === "en" ? "Secure upload" : "Téléversement sécurisé"}
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
                  <Image src={p.src} alt={p.alt} width={320} height={160} className="rs-week-photo-img" sizes="(max-width:768px) 100vw, 360px" />
                  <span className="rs-week-photo-cap">{p.alt}</span>
                </Link>
              ))}
            </div>
          </div>
        </section>

        <section className="rs-section rs-section-muted">
          <div className="rs-container">
            <p className="rs-eyebrow">{L.insight}</p>
            <div className="rs-week-video-shell">
              {bundle.video.embedUrl ? (
                <div className="rs-week-video-frame">
                  <iframe title={bundle.video.title} src={bundle.video.embedUrl} allowFullScreen loading="lazy" />
                </div>
              ) : (
                <div className="rs-week-video-placeholder">
                  <p className="rs-week-video-title">{bundle.video.title}</p>
                  <p className="rs-week-video-desc">{bundle.video.description}</p>
                  <a href={bundle.video.fallbackHref} className="rs-btn-accent" target="_blank" rel="noopener noreferrer">
                    {L.watchLabel}
                  </a>
                </div>
              )}
            </div>
          </div>
        </section>

        <section className="rs-section">
          <div className="rs-container">
            <div className="rs-cta-strip">
              <div>
                <h2 className="rs-h2" style={{ fontSize: "clamp(1.45rem, 2.5vw, 1.85rem)" }}>
                  {bundle.cta.title}
                </h2>
                <p className="rs-subtitle" style={{ marginTop: "0.65rem" }}>
                  {bundle.cta.subtitle}
                </p>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.65rem", justifyContent: "flex-end" }}>
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
