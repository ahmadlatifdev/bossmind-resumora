import { useRouter } from "next/router";
import { useEffect } from "react";

import { LanguageProvider, useLanguage } from "@/context/LanguageContext";

import "@/styles/resumora-global.css";

export default function App({ Component, pageProps }) {
  return (
    <LanguageProvider>
      <div className="rs-root-font">
        <PwaAndAnalytics />
        <Component {...pageProps} />
      </div>
    </LanguageProvider>
  );
}

function PwaAndAnalytics() {
  const router = useRouter();
  const { lang } = useLanguage();

  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    });
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
