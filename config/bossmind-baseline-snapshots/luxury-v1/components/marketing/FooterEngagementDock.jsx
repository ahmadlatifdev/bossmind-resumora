import Link from "next/link";
import { useState } from "react";
import { LayoutGrid, Share2, UserPlus, Users } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { FOOTER_SITE_RESOURCE_KEY } from "@/lib/engagement/service-ids";
import { translations } from "@/lib/marketing/site-copy";

/** Minimal premium footer CTAs — social follow anchor, share, plans, register (no trust-chip clutter). */
export default function FooterEngagementDock({ variant = "default" }) {
  const { lang } = useLanguage();
  const t = translations[lang];
  const [busy, setBusy] = useState(false);

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

  return (
    <div className={`rs-footer-engage-dock rs-footer-engage-dock--cta-only ${variant === "minimal" ? "rs-footer-engage-dock--minimal" : ""}`}>
      <div className="rs-footer-engage-toolbar" role="group" aria-label={t.footerToolbarAria}>
        <a href="#footer-official-social" className="rs-foot-engage-v2 rs-foot-engage-v2--link">
          <Users className="rs-foot-engage-v2__icon" size={22} strokeWidth={1.75} aria-hidden />
          <span className="rs-foot-engage-v2__label">{t.engagementFollow}</span>
        </a>
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
    </div>
  );
}
