import Head from "next/head";
import { useRouter } from "next/router";
import { useEffect, useRef } from "react";
import MinimalAppChrome from "@/components/marketing/MinimalAppChrome";
import StudioCalmPrepare from "@/components/client/StudioCalmPrepare";
import { useLanguage } from "@/context/LanguageContext";
import { translations } from "@/lib/marketing/site-copy";
import {
  clearRedirectTrace,
  logCheckoutRuntime,
  persistCheckoutSessionId,
  prefetchCheckoutActivation,
  recordRedirect,
  shouldBlockRedirect,
} from "@/lib/client/checkout-runtime";

/** Stripe return — persist session, prefetch activation once, single redirect to studio. */
export default function SuccessPage() {
  const router = useRouter();
  const { lang } = useLanguage();
  const t = translations[lang];
  const redirectedRef = useRef(false);
  const { session_id } = router.query;
  const sid =
    typeof session_id === "string"
      ? session_id
      : Array.isArray(session_id) && typeof session_id[0] === "string"
        ? session_id[0]
        : "";

  useEffect(() => {
    if (!router.isReady || redirectedRef.current) return;
    redirectedRef.current = true;

    const from = router.asPath || "/success";
    const target = sid
      ? `/studio?session_id=${encodeURIComponent(sid)}&checkout=success`
      : "/studio";

    if (shouldBlockRedirect(from, target)) {
      logCheckoutRuntime("success_redirect_blocked", { from, target });
      router.replace("/studio?recovery=session").catch(() => {});
      return;
    }

    (async () => {
      if (sid) {
        persistCheckoutSessionId(sid);
        clearRedirectTrace();
        await prefetchCheckoutActivation(sid, lang === "fr" ? "fr" : "en");
      }
      recordRedirect(from, target);
      logCheckoutRuntime("success_redirect", { target, hasSessionId: Boolean(sid) });
      await router.replace(target);
    })();
  }, [router.isReady, sid, router, lang]);

  return (
    <MinimalAppChrome>
      <Head>
        <title>{t.clientHubLoading} · Resumora</title>
        <meta name="robots" content="noindex" />
      </Head>
      <main className="rs-app-shell rs-app-shell--minimal-main rs-client-hub--calm-prepare">
        <StudioCalmPrepare lang={lang} />
      </main>
    </MinimalAppChrome>
  );
}
