import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Bell, LayoutGrid, Share2, UserPlus } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { FOOTER_SITE_RESOURCE_KEY } from "@/lib/engagement/service-ids";
import { SERVICE_LABELS, translations } from "@/lib/marketing/site-copy";

export default function FooterEngagementDock({ variant = "default" }) {
  const { lang } = useLanguage();
  const t = translations[lang];
  const labels = SERVICE_LABELS[lang] || SERVICE_LABELS.en;
  const [stats, setStats] = useState(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const r = await fetch("/api/engagement/stats", { credentials: "same-origin" });
      if (r.ok) setStats(await r.json());
      else setStats({ enabled: false });
    } catch {
      setStats({ enabled: false });
    }
  }, []);

  useEffect(() => {
    const id = window.setTimeout(() => {
      void refresh();
    }, 0);
    const poll = window.setInterval(() => {
      void refresh();
    }, 24000);
    const onVis = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.clearTimeout(id);
      window.clearInterval(poll);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [refresh]);

  const regionHint = () =>
    typeof navigator !== "undefined"
      ? `${navigator.language || ""}|${Intl.DateTimeFormat().resolvedOptions().timeZone || ""}`
      : "";

  const runAction = async (body, { silent503 = false } = {}) => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/engagement/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ ...body, regionHint: regionHint() }),
      });
      if (res.status === 503) {
        if (!silent503) window.alert(t.engagementDisabled);
        return;
      }
      if (res.ok) await refresh();
    } finally {
      setBusy(false);
    }
  };

  const onShare = async () => {
    if (busy) return;
    const url = typeof window !== "undefined" ? window.location.href : "https://resumora.net";
    try {
      if (navigator.share) {
        await navigator.share({ title: "Resumora", url, text: t.engagementShareText });
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        window.alert(t.footerShareCopied);
      } else {
        window.prompt(t.footerShareCopied, url);
      }
      await runAction({ type: "share", resourceKey: FOOTER_SITE_RESOURCE_KEY }, { silent503: true });
    } catch {
      window.alert(t.footerShareFail);
    }
  };

  const neonReady = stats?.enabled === true;
  const following = Boolean(stats?.followingBrand);

  const trendingLabel = useMemo(() => {
    if (!neonReady || !stats?.trendingServices?.length) return null;
    const top = stats.trendingServices[0];
    if (!top?.key || !(Number(top.score) > 0)) return null;
    return labels[top.key] || null;
  }, [neonReady, stats, labels]);

  return (
    <div className={`rs-footer-engage-dock ${variant === "minimal" ? "rs-footer-engage-dock--minimal" : ""}`}>
      <div className="rs-footer-engage-head">
        <span className="rs-footer-engage-title">{t.footerDockEngage}</span>
        <span className="rs-footer-engage-sub">{t.footerEngageBarLead}</span>
      </div>

      <div className="rs-footer-trust-chips" aria-label={t.footerLiveSignals}>
        <span className="rs-footer-trust-chip">{t.footerTrustChipPopular}</span>
        <span className="rs-footer-trust-chip">{t.footerTrustChipRecent}</span>
        <span className="rs-footer-trust-chip rs-footer-trust-chip--gold">{t.footerTrustChipElite}</span>
        <span className="rs-footer-trust-chip">{t.footerTrustChipSecure}</span>
        <span className="rs-footer-trust-chip rs-footer-trust-chip--ai">{t.footerTrustChipAi}</span>
        {trendingLabel ? (
          <span className="rs-footer-trust-chip rs-footer-trust-chip--trend">
            {t.footerTrendingPrefix}: {trendingLabel}
          </span>
        ) : null}
        {!neonReady ? <span className="rs-footer-trust-chip rs-footer-trust-chip--muted">{t.footerConfigureNeon}</span> : null}
      </div>

      <div
        className="rs-footer-engage-toolbar"
        role="group"
        aria-label={`${t.footerDockEngage}. ${t.footerEngageBarLead}`}
      >
        <button
          type="button"
          className={`rs-foot-engage-v2 ${following ? "rs-foot-engage-v2--active" : ""}`}
          disabled={busy || !neonReady}
          title={!neonReady ? t.engagementDisabled : undefined}
          aria-pressed={following ? "true" : "false"}
          onClick={() => runAction({ type: following ? "unfollow" : "follow" })}
        >
          <Bell className="rs-foot-engage-v2__icon" size={22} strokeWidth={1.75} aria-hidden />
          <span className="rs-foot-engage-v2__label">{following ? t.engagementFollowing : t.engagementFollow}</span>
        </button>
        <button type="button" className="rs-foot-engage-v2" disabled={busy} onClick={onShare}>
          <Share2 className="rs-foot-engage-v2__icon" size={22} strokeWidth={1.75} aria-hidden />
          <span className="rs-foot-engage-v2__label">{t.footerEngageShare}</span>
        </button>
        <Link href="/pricing#pricing" className="rs-foot-engage-v2 rs-foot-engage-v2--link">
          <LayoutGrid className="rs-foot-engage-v2__icon" size={22} strokeWidth={1.75} aria-hidden />
          <span className="rs-foot-engage-v2__label">{t.footerPricingCta}</span>
        </Link>
        <Link href="/register" className="rs-foot-engage-v2 rs-foot-engage-v2--link">
          <UserPlus className="rs-foot-engage-v2__icon" size={22} strokeWidth={1.75} aria-hidden />
          <span className="rs-foot-engage-v2__label">{t.footerEngageRegister}</span>
        </Link>
      </div>
      <p className="rs-footer-follow-bridge">
        <a href="#footer-official-social" className="rs-footer-follow-bridge-link">
          {t.footerFollowChannelsCta}
        </a>
        <span className="rs-footer-follow-bridge-sub"> {t.footerFollowChannelsSub}</span>
      </p>
    </div>
  );
}
