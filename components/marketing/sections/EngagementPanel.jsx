import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useLanguage } from "@/context/LanguageContext";
import { SERVICE_LABELS, translations } from "@/lib/marketing/site-copy";

export default function EngagementPanel() {
  const { lang } = useLanguage();
  const t = translations[lang];
  const labels = SERVICE_LABELS[lang];
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
    const pollId = window.setInterval(() => {
      void fetch("/api/engagement/stats", { credentials: "same-origin" })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (!c && d) setEngStats(d);
        })
        .catch(() => {});
    }, 28000);
    const onVis = () => {
      if (document.visibilityState === "visible") {
        void fetch("/api/engagement/stats", { credentials: "same-origin" })
          .then((r) => (r.ok ? r.json() : null))
          .then((d) => {
            if (!c && d) setEngStats(d);
          })
          .catch(() => {});
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      c = true;
      window.clearInterval(pollId);
      document.removeEventListener("visibilitychange", onVis);
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

  const trendingMerged = useMemo(() => {
    const likes = engStats?.likesByResource || [];
    const reqs = engStats?.requestsByResource || [];
    const map = {};
    for (const r of likes) map[r.key] = (map[r.key] || 0) + Number(r.count || 0);
    for (const r of reqs) map[r.key] = (map[r.key] || 0) + Number(r.count || 0) * 2;
    return Object.entries(map)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([key, count]) => ({ key, count }));
  }, [engStats]);

  const mostSaved = engStats?.savesByResource?.slice(0, 6) ?? [];
  const mostRequested = engStats?.requestsByResource?.slice(0, 6) ?? [];

  return (
    <section id="engagement" className="rs-section">
      <div className="rs-container">
        <p className="rs-eyebrow">{t.navEngagement}</p>
        <h2 className="rs-h2">{t.engagementTitle}</h2>
        <p className="rs-subtitle">{t.engagementSubtitle}</p>
        <div className="rs-engage-hero">
          <div className="rs-engage-metrics">
            <div className="rs-engage-metric">
              <span className="rs-engage-metric-value">{engStats?.followers ?? "—"}</span>
              <span className="rs-engage-metric-label">{t.engagementMetricFollowers}</span>
            </div>
            <div className="rs-engage-metric">
              <span className="rs-engage-metric-value">{engStats?.registrations ?? "—"}</span>
              <span className="rs-engage-metric-label">{t.engagementMetricRegistrations}</span>
            </div>
            <div className="rs-engage-metric">
              <span className="rs-engage-metric-value">{engStats?.enabled === false ? "—" : t.engagementNeonLive}</span>
              <span className="rs-engage-metric-label">{t.engagementMetricNeon}</span>
            </div>
            <div className="rs-engage-metric">
              <span className="rs-engage-metric-value">
                {engStats?.enabled === false ? "—" : engStats?.sharesTotal ?? 0}
              </span>
              <span className="rs-engage-metric-label">{t.engagementMetricShares}</span>
            </div>
          </div>
          {engStats?.serverTs ? (
            <p className="rs-engage-synced">
              {t.engagementSyncedShort}:{" "}
              {new Date(engStats.serverTs).toLocaleString(lang === "fr" ? "fr-FR" : "en-US", {
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
                month: "short",
                day: "numeric",
              })}
            </p>
          ) : null}
          <button
            type="button"
            className="rs-engage-inline-text"
            disabled={engBusy}
            data-active={engStats?.followingBrand ? "true" : "false"}
            onClick={() => runEngagementAction({ type: engStats?.followingBrand ? "unfollow" : "follow" })}
          >
            <span>{engStats?.followingBrand ? t.engagementFollowing : t.engagementFollow}</span>
            {!engStats?.followingBrand ? (
              <>
                <span className="rs-engage-sep">·</span>
                <span>{t.engagementSubscribeShort}</span>
              </>
            ) : null}
          </button>
          <Link href="/dashboard" className="rs-engage-inline-link">
            {t.engagementAnalyticsLink}
          </Link>
        </div>
        <div className="rs-engage-quad">
          <div className="rs-engage-quad-col">
            <h3 className="rs-engage-quad-title">{t.engagementTrending}</h3>
            <ul className="rs-engage-list">
              {trendingMerged.map((row) => (
                <li key={row.key}>
                  <span>{labels[row.key] || row.key}</span>
                  <span className="rs-engage-count">{row.count}</span>
                </li>
              ))}
              {!trendingMerged.length ? (
                <li className="rs-engage-empty">{t.engagementEmptySignals}</li>
              ) : null}
            </ul>
          </div>
          <div className="rs-engage-quad-col">
            <h3 className="rs-engage-quad-title">{t.engagementMostLiked}</h3>
            <ul className="rs-engage-list">
              {(engStats?.likesByResource || []).slice(0, 6).map((row) => (
                <li key={`like-${row.key}`}>
                  <span>{labels[row.key] || row.key}</span>
                  <span className="rs-engage-count">{row.count}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="rs-engage-quad-col">
            <h3 className="rs-engage-quad-title">{t.engagementMostSaved}</h3>
            <ul className="rs-engage-list">
              {mostSaved.map((row) => (
                <li key={`save-${row.key}`}>
                  <span>{labels[row.key] || row.key}</span>
                  <span className="rs-engage-count">{row.count}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="rs-engage-quad-col">
            <h3 className="rs-engage-quad-title">{t.engagementMostRequested}</h3>
            <ul className="rs-engage-list">
              {mostRequested.map((row) => (
                <li key={`req-${row.key}`}>
                  <span>{labels[row.key] || row.key}</span>
                  <span className="rs-engage-count">{row.count}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
