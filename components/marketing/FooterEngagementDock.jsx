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
    return () => window.clearTimeout(id);
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

  return (
    <div className={`rs-footer-engage-dock ${variant === "minimal" ? "rs-footer-engage-dock--minimal" : ""}`}>
      <p className="rs-footer-dock-label rs-footer-dock-label--subtle">{t.footerDockEngage}</p>
      <div className="rs-footer-engage-actions rs-footer-engage-actions--bare">
        <button
          type="button"
          className={`rs-foot-engage ${liked ? "rs-foot-engage--active" : ""}`}
          disabled={busy || !neonReady}
          aria-pressed={liked ? "true" : "false"}
          onClick={() => runAction({ type: "like", resourceKey: FOOTER_SITE_RESOURCE_KEY })}
        >
          <ThumbsUp size={17} strokeWidth={1.75} aria-hidden />
          <span>{t.footerEngageLike}</span>
        </button>
        <button
          type="button"
          className={`rs-foot-engage ${disliked ? "rs-foot-engage--active" : ""}`}
          disabled={busy || !neonReady}
          aria-pressed={disliked ? "true" : "false"}
          onClick={() => runAction({ type: "dislike", resourceKey: FOOTER_SITE_RESOURCE_KEY })}
        >
          <ThumbsDown size={17} strokeWidth={1.75} aria-hidden />
          <span>{t.footerEngageDislike}</span>
        </button>
        <button type="button" className="rs-foot-engage" disabled={busy} onClick={onShare}>
          <Share2 size={17} strokeWidth={1.75} aria-hidden />
          <span>{t.footerEngageShare}</span>
        </button>
        <Link href="/register" className="rs-foot-engage rs-foot-engage--link">
          <UserPlus size={17} strokeWidth={1.75} aria-hidden />
          <span>{t.footerEngageRegister}</span>
        </Link>
      </div>
    </div>
  );
}
