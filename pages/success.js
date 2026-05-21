import Head from "next/head";
import { useRouter } from "next/router";
import { useEffect } from "react";
import MinimalAppChrome from "@/components/marketing/MinimalAppChrome";
import { useLanguage } from "@/context/LanguageContext";
import { translations } from "@/lib/marketing/site-copy";

/** Legacy /success — hands-free redirect straight into studio activation (no intermediate UI). */
export default function SuccessPage() {
  const router = useRouter();
  const { lang } = useLanguage();
  const t = translations[lang];
  const { session_id } = router.query;
  const sid =
    typeof session_id === "string"
      ? session_id
      : Array.isArray(session_id) && typeof session_id[0] === "string"
        ? session_id[0]
        : "";

  useEffect(() => {
    if (!router.isReady) return;
    if (!sid) {
      router.replace("/studio").catch(() => {});
      return;
    }
    try {
      sessionStorage.setItem("rs_last_checkout_session", sid);
    } catch {
      /* ignore */
    }
    router.replace(`/studio?session_id=${encodeURIComponent(sid)}`).catch(() => {});
  }, [router.isReady, sid, router]);

  return (
    <MinimalAppChrome>
      <Head>
        <title>{t.clientHubLoading} · Resumora</title>
        <meta name="robots" content="noindex" />
      </Head>
      <main className="rs-app-shell rs-app-shell--minimal-main rs-client-hub--loading">
        <p style={{ textAlign: "center", opacity: 0.6 }}>{t.clientHubLoading}</p>
      </main>
    </MinimalAppChrome>
  );
}
