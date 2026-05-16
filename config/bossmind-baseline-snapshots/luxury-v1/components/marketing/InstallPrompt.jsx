import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { useLanguage } from "@/context/LanguageContext";
import { translations } from "@/lib/marketing/site-copy";

const DISMISS_KEY = "rs_pwa_install_dismissed";
const PRICING_UI_SEEN_KEY = "rs_pwa_pricing_scroll_seen";
const DELAY_MS = 45_000;

function pricingInteractionActive() {
  if (typeof document === "undefined") return false;
  return document.body?.dataset?.rsPricingActive === "1";
}

function pricingSectionInView() {
  if (typeof document === "undefined") return false;
  const el = document.getElementById("pricing");
  if (!el) return false;
  const rect = el.getBoundingClientRect();
  const vh = window.innerHeight || document.documentElement.clientHeight;
  return rect.top < vh * 0.85 && rect.bottom > vh * 0.15;
}

export default function InstallPrompt() {
  const router = useRouter();
  const { lang } = useLanguage();
  const t = translations[lang];
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      if (sessionStorage.getItem(DISMISS_KEY)) return;
    } catch {
      /* ignore */
    }

    let deferredReady = false;
    let delayTimer;
    let scrollTimer;

    const setPricingBodyFlag = (on) => {
      try {
        if (on) document.body.dataset.rsPricingActive = "1";
        else delete document.body.dataset.rsPricingActive;
      } catch {
        /* ignore */
      }
    };

    const hideForPricing = () => {
      setVisible(false);
      setPricingBodyFlag(true);
      try {
        sessionStorage.setItem(PRICING_UI_SEEN_KEY, "1");
      } catch {
        /* ignore */
      }
    };

    const maybeShow = () => {
      if (typeof window === "undefined" || !window.__rsDeferredPrompt) return;
      if (pricingSectionInView() || pricingInteractionActive()) {
        try {
          sessionStorage.setItem(PRICING_UI_SEEN_KEY, "1");
        } catch {
          /* ignore */
        }
        return;
      }
      try {
        if (sessionStorage.getItem(PRICING_UI_SEEN_KEY) === "1") return;
      } catch {
        /* ignore */
      }
      setVisible(true);
    };

    const onInstallable = () => {
      deferredReady = true;
      clearTimeout(delayTimer);
      delayTimer = window.setTimeout(maybeShow, DELAY_MS);
    };

    const onScroll = () => {
      if (!deferredReady) return;
      clearTimeout(scrollTimer);
      scrollTimer = window.setTimeout(() => {
        if (pricingSectionInView()) hideForPricing();
      }, 120);
    };

    const pricingEl = document.getElementById("pricing");
    let io;
    if (pricingEl && typeof IntersectionObserver !== "undefined") {
      io = new IntersectionObserver(
        (entries) => {
          if (entries.some((e) => e.isIntersecting && e.intersectionRatio > 0.08)) hideForPricing();
        },
        { threshold: [0, 0.08, 0.25] }
      );
      io.observe(pricingEl);
    }

    const onPricingPointer = (ev) => {
      const t = ev.target;
      if (!(t instanceof Element)) return;
      if (
        t.closest("#pricing") ||
        t.closest(".rs-pricing-grid") ||
        t.closest("[data-tier]") ||
        t.closest(".rs-pricing-section")
      ) {
        hideForPricing();
      }
    };

    if (window.__rsDeferredPrompt) onInstallable();
    window.addEventListener("rs:pwa-installable", onInstallable);
    window.addEventListener("scroll", onScroll, { passive: true });
    document.addEventListener("pointerdown", onPricingPointer, { capture: true, passive: true });
    document.addEventListener("focusin", onPricingPointer, { capture: true });

    return () => {
      clearTimeout(delayTimer);
      clearTimeout(scrollTimer);
      io?.disconnect();
      setPricingBodyFlag(false);
      window.removeEventListener("rs:pwa-installable", onInstallable);
      window.removeEventListener("scroll", onScroll);
      document.removeEventListener("pointerdown", onPricingPointer, { capture: true });
      document.removeEventListener("focusin", onPricingPointer, { capture: true });
    };
  }, []);

  useEffect(() => {
    if (router.asPath.includes("#pricing") || router.asPath === "/pricing") {
      setVisible(false);
    }
  }, [router.asPath]);

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
