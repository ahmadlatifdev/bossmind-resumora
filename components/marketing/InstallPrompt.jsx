import { useEffect, useState } from "react";
import { useLanguage } from "@/context/LanguageContext";
import { translations } from "@/lib/marketing/site-copy";

const DISMISS_KEY = "rs_pwa_install_dismissed";

export default function InstallPrompt() {
  const { lang } = useLanguage();
  const t = translations[lang];
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      if (sessionStorage.getItem(DISMISS_KEY)) return;
    } catch {
      /* ignore */
    }

    const check = () => {
      if (typeof window === "undefined") return;
      if (window.__rsDeferredPrompt) setVisible(true);
    };

    check();
    window.addEventListener("rs:pwa-installable", check);
    return () => window.removeEventListener("rs:pwa-installable", check);
  }, []);

  const dismiss = () => {
    try {
      sessionStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* ignore */
    }
    setVisible(false);
  };

  const install = async () => {
    const prompt = typeof window !== "undefined" ? window.__rsDeferredPrompt : null;
    if (!prompt || typeof prompt.prompt !== "function") return;
    try {
      await prompt.prompt();
      await prompt.userChoice.catch(() => {});
    } catch {
      /* ignore */
    }
    window.__rsDeferredPrompt = undefined;
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div className="rs-install-banner" role="region" aria-label={t.installPwaTitle}>
      <p className="rs-install-banner-text">{t.installPwaTitle}</p>
      <div className="rs-install-banner-actions">
        <button type="button" className="rs-btn-accent rs-install-btn" onClick={install}>
          {t.installPwaInstall}
        </button>
        <button type="button" className="rs-btn-ghost rs-install-btn" onClick={dismiss}>
          {t.installPwaDismiss}
        </button>
      </div>
    </div>
  );
}
