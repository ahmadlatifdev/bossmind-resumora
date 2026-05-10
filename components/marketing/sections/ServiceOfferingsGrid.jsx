import Link from "next/link";
import { ArrowRight, Bookmark, Heart } from "lucide-react";
import { useEffect, useState } from "react";
import { useLanguage } from "@/context/LanguageContext";
import { servicesByLang, translations } from "@/lib/marketing/site-copy";

export default function ServiceOfferingsGrid({ variant = "capabilities" }) {
  const { lang } = useLanguage();
  const t = translations[lang];
  const items = servicesByLang[lang];
  const [engStats, setEngStats] = useState(null);
  const [engBusy, setEngBusy] = useState(false);

  useEffect(() => {
    let c = false;
    fetch("/api/engagement/stats", { credentials: "same-origin" })
      .then((r) => r.json())
      .then((d) => {
        if (!c) setEngStats(d);
      })
      .catch(() => {
        if (!c) setEngStats({ enabled: false });
      });
    return () => {
      c = true;
    };
  }, []);

  const regionHint = () =>
    typeof navigator !== "undefined"
      ? `${navigator.language || ""}|${Intl.DateTimeFormat().resolvedOptions().timeZone || ""}`
      : "";

  const refreshEngagement = async () => {
    const r = await fetch("/api/engagement/stats", { credentials: "same-origin" });
    if (r.ok) setEngStats(await r.json());
  };

  const runEngagementAction = async (payload) => {
    if (engBusy) return;
    setEngBusy(true);
    try {
      const res = await fetch("/api/engagement/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ ...payload, regionHint: regionHint() }),
      });
      if (res.ok) await refreshEngagement();
      else if (res.status === 503) window.alert(t.engagementDisabled);
    } finally {
      setEngBusy(false);
    }
  };

  const title = variant === "services" ? t.servicesTitle : t.capabilitiesTitle;
  const subtitle = variant === "services" ? t.servicesSubtitle : t.capabilitiesSubtitle;
  const eyebrow = variant === "services" ? t.navServices : t.navCapabilities;

  return (
    <section id={variant === "services" ? "catalogue" : "capabilities"} className="rs-section">
      <div className="rs-container">
        <p className="rs-eyebrow">{eyebrow}</p>
        <h2 className="rs-h2">{title}</h2>
        <p className="rs-subtitle">{subtitle}</p>
        <div className={`rs-card-grid${variant === "capabilities" ? " rs-card-grid--compact" : ""}`}>
          {items.map((item) => {
            const I = item.Icon;
            const liked = engStats?.myLikes?.includes(item.resourceKey);
            const saved = engStats?.mySaves?.includes(item.resourceKey);
            return (
              <article key={item.resourceKey} className="rs-service-card rs-card-interactive">
                <span className="rs-cat-pill">
                  {t.serviceCategory}: {item.category}
                </span>
                <Link href={item.ctaHref} className="rs-card-title-link">
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <I size={22} strokeWidth={1.45} className="rs-icon-gold" aria-hidden />
                    <h3>{item.title}</h3>
                  </div>
                  <p>{item.description}</p>
                </Link>
                <div className="rs-engage-row" aria-label="Engagement">
                  <button
                    type="button"
                    className="rs-engage-pill"
                    data-active={liked ? "true" : "false"}
                    disabled={engBusy}
                    onClick={() => runEngagementAction({ type: "like", resourceKey: item.resourceKey })}
                  >
                    <Heart size={16} strokeWidth={1.5} className="rs-icon-gold" fill={liked ? "currentColor" : "none"} aria-hidden />
                    {t.engagementLike}
                  </button>
                  <button
                    type="button"
                    className="rs-engage-pill"
                    data-active={saved ? "true" : "false"}
                    disabled={engBusy}
                    onClick={() => runEngagementAction({ type: "save", resourceKey: item.resourceKey })}
                  >
                    <Bookmark size={16} strokeWidth={1.5} className="rs-icon-gold" fill={saved ? "currentColor" : "none"} aria-hidden />
                    {t.engagementSave}
                  </button>
                  <button
                    type="button"
                    className="rs-engage-pill"
                    data-active="false"
                    disabled={engBusy}
                    onClick={() => runEngagementAction({ type: "request", resourceKey: item.resourceKey })}
                  >
                    {t.engagementRequest}
                  </button>
                </div>
                <Link href={item.ctaHref} className="rs-card-cta">
                  {item.ctaLabel}
                  <ArrowRight size={14} aria-hidden />
                </Link>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
