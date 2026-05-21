import { useRouter } from "next/router";
import { useEffect, useRef } from "react";

import { LanguageProvider, useLanguage } from "@/context/LanguageContext";
import {
  clearStaleServiceWorkerCaches,
  isCheckoutSensitivePath,
  logCheckoutRuntime,
  recordRedirect,
  shouldBlockRedirect,
} from "@/lib/client/checkout-runtime";

import "@/styles/resumora-global.css";

export default function App({ Component, pageProps }) {
  return (
    <LanguageProvider>
      <div className="rs-root-font">
        <PwaAndAnalytics />
        <CheckoutJourneyGuard />
        <Component {...pageProps} />
      </div>
    </LanguageProvider>
  );
}

/** Global anti-loop: block ping-pong redirects on checkout/auth routes. */
function CheckoutJourneyGuard() {
  const router = useRouter();
  const lastPathRef = useRef("");

  useEffect(() => {
    if (!router.isReady) return;

    const path = router.asPath || router.pathname;
    if (isCheckoutSensitivePath(router.pathname)) {
      clearStaleServiceWorkerCaches(router.pathname);
    }

    const prev = lastPathRef.current;
    if (prev && prev !== path) {
      if (shouldBlockRedirect(prev, path)) {
        logCheckoutRuntime("app_redirect_loop_break", { from: prev, to: path });
        router.replace("/studio?recovery=loop").catch(() => {});
        return;
      }
      recordRedirect(prev, path);
      logCheckoutRuntime("route_change", { from: prev, to: path });
    }
    lastPathRef.current = path;
  }, [router.isReady, router.asPath, router.pathname, router]);

  return null;
}

function PwaAndAnalytics() {
  const router = useRouter();
  const { lang } = useLanguage();

  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    const onLoad = () => {
      navigator.serviceWorker
        .register("/sw.js")
        .then((reg) => {
          reg.update().catch(() => {});
          logCheckoutRuntime("sw_registered", { scope: reg.scope });
        })
        .catch((e) => logCheckoutRuntime("sw_register_error", { message: e?.message }));
    };
    window.addEventListener("load", onLoad);
    return () => window.removeEventListener("load", onLoad);
  }, []);

  useEffect(() => {
    const send = (path) => {
      fetch("/api/analytics/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          path,
          referrer: typeof document !== "undefined" ? document.referrer : "",
          lang: lang === "fr" ? "fr" : "en",
          source: "route",
        }),
      }).catch(() => {});
    };
    send(router.asPath);
    const onChange = (url) => send(url);
    router.events.on("routeChangeComplete", onChange);
    return () => router.events.off("routeChangeComplete", onChange);
  }, [router, lang]);

  useEffect(() => {
    const handler = (e) => {
      e.preventDefault();
      if (typeof window !== "undefined") {
        window.__rsDeferredPrompt = e;
        window.dispatchEvent(new CustomEvent("rs:pwa-installable"));
      }
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  return null;
}
