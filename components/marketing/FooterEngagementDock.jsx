import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Share2, ThumbsDown, ThumbsUp, UserPlus } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { FOOTER_SITE_RESOURCE_KEY } from "@/lib/engagement/service-ids";
import { translations } from "@/lib/marketing/site-copy";

export default function FooterEngagementDock({ variant = "default" }) {
  const { lang } = useLanguage();
  const t = translations[lang];
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
    }, 20000);
    return () => {
      window.clearTimeout(id);
      window.clearInterval(poll);
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
        await navigator.share({ title: "Resumora", url, text: "Resumora — executive resume studio." });
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
  const liked = stats?.myLikes?.includes(FOOTER_SITE_RESOURCE_KEY);
  const disliked = stats?.myDislikes?.includes(FOOTER_SITE_RESOURCE_KEY);
  const likeCount =
    stats?.likesByResource?.find((x) => x.key === FOOTER_SITE_RESOURCE_KEY)?.count ?? 0;
  const dislikeCount =
    stats?.dislikesByResource?.find((x) => x.key === FOOTER_SITE_RESOURCE_KEY)?.count ?? 0;

  return (
    <div className={`rs-footer-engage-dock ${variant === "minimal" ? "rs-footer-engage-dock--minimal" : ""}`}>
      <div className="rs-footer-engage-head">
        <span className="rs-footer-engage-title">{t.footerDockEngage}</span>
        <span className="rs-footer-engage-sub">{t.footerEngageBarLead}</span>
      </div>
      <div
        className="rs-footer-engage-toolbar"
        role="group"
        aria-label={`${t.footerDockEngage}. ${t.footerEngageBarLead}`}
      >
        <button
          type="button"
          className={`rs-foot-engage-v2 ${liked ? "rs-foot-engage-v2--active" : ""}`}
          disabled={busy || !neonReady}
          title={!neonReady ? t.engagementDisabled : undefined}
          aria-pressed={liked ? "true" : "false"}
          onClick={() => runAction({ type: "like", resourceKey: FOOTER_SITE_RESOURCE_KEY })}
        >
          <ThumbsUp className="rs-foot-engage-v2__icon" size={22} strokeWidth={1.75} aria-hidden />
          <span className="rs-foot-engage-v2__label">{t.footerEngageLike}</span>
          <span className="rs-foot-engage-v2__badge" aria-label="Likes">
            {likeCount}
          </span>
        </button>
        <button
          type="button"
          className={`rs-foot-engage-v2 ${disliked ? "rs-foot-engage-v2--active-dislike" : ""}`}
          disabled={busy || !neonReady}
          title={!neonReady ? t.engagementDisabled : undefined}
          aria-pressed={disliked ? "true" : "false"}
          onClick={() => runAction({ type: "dislike", resourceKey: FOOTER_SITE_RESOURCE_KEY })}
        >
          <ThumbsDown className="rs-foot-engage-v2__icon" size={22} strokeWidth={1.75} aria-hidden />
          <span className="rs-foot-engage-v2__label">{t.footerEngageDislike}</span>
          <span className="rs-foot-engage-v2__badge" aria-label="Dislikes">
            {dislikeCount}
          </span>
        </button>
        <button type="button" className="rs-foot-engage-v2" disabled={busy} onClick={onShare}>
          <Share2 className="rs-foot-engage-v2__icon" size={22} strokeWidth={1.75} aria-hidden />
          <span className="rs-foot-engage-v2__label">{t.footerEngageShare}</span>
        </button>
        <Link href="/register" className="rs-foot-engage-v2 rs-foot-engage-v2--link">
          <UserPlus className="rs-foot-engage-v2__icon" size={22} strokeWidth={1.75} aria-hidden />
          <span className="rs-foot-engage-v2__label">{t.footerEngageRegister}</span>
        </Link>
      </div>
    </div>
  );
}
