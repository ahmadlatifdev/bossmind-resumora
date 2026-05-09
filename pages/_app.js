import { Inter } from "next/font/google";
import { useRouter } from "next/router";
import { useEffect } from "react";

import { LanguageProvider } from "@/context/LanguageContext";

import "@/styles/resumora-global.css";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
});

function PwaAndAnalytics() {
  const router = useRouter();

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
          lang: typeof navigator !== "undefined" ? navigator.language : "",
          source: "route",
        }),
      }).catch(() => {});
    };
    send(router.asPath);
    const onChange = (url) => send(url);
    router.events.on("routeChangeComplete", onChange);
    return () => router.events.off("routeChangeComplete", onChange);
  }, [router]);

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

export default function App({ Component, pageProps }) {
  return (
    <LanguageProvider>
      <div className={inter.className}>
        <PwaAndAnalytics />
        <Component {...pageProps} />
      </div>
    </LanguageProvider>
  );
}
