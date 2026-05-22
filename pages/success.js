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
import { STUDIO_UI_HARD_TIMEOUT_MS } from "@/lib/client/luxury-checkout-client";

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
      ? `/studio?session_id=${encodeURIComponent(sid)}`
      : "/studio";

    if (shouldBlockRedirect(from, target)) {
      logCheckoutRuntime("success_redirect_blocked", { from, target });
      router.replace("/studio?recovery=session").catch(() => {});
      return;
    }

    const failSafe = setTimeout(() => {
      logCheckoutRuntime("success_redirect_failsafe", { target });
      router.replace(sid ? `/studio?recovery=activation&session_id=${encodeURIComponent(sid)}` : "/studio?recovery=session").catch(() => {});
    }, STUDIO_UI_HARD_TIMEOUT_MS);

    (async () => {
      try {
        if (sid) {
          persistCheckoutSessionId(sid);
          clearRedirectTrace();
          logCheckoutRuntime("success_session_id_received", { sessionIdPrefix: sid.slice(0, 20) });
          await Promise.race([
            prefetchCheckoutActivation(sid, lang === "fr" ? "fr" : "en"),
            new Promise((r) => setTimeout(r, STUDIO_UI_HARD_TIMEOUT_MS - 500)),
          ]);
        }
        recordRedirect(from, target);
        logCheckoutRuntime("success_redirect", { target, hasSessionId: Boolean(sid) });
        await router.replace(target);
      } finally {
        clearTimeout(failSafe);
      }
    })();

    return () => clearTimeout(failSafe);
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
