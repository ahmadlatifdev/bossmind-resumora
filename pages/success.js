import Head from "next/head";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import Link from "next/link";
import MinimalAppChrome from "@/components/marketing/MinimalAppChrome";
import { useLanguage } from "@/context/LanguageContext";
import { translations } from "@/lib/marketing/site-copy";

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

  /** Per-session verify result — avoids stale state when `session_id` query changes. */
  const [bySession, setBySession] = useState(
    /** @type {Record<string, { status: "pending" | "success" | "invalid" | "error"; planId?: string; studioPath?: string }>} */ ({})
  );

  useEffect(() => {
    if (!router.isReady || !sid) return;
    let cancelled = false;
    fetch(`/api/verify-session?session_id=${encodeURIComponent(sid)}`)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        setBySession((prev) => ({
          ...prev,
          [sid]: {
            status: data.valid ? "success" : "invalid",
            planId: data.planId || null,
            studioPath: data.studioPath || data.clientHubPath || "/studio",
          },
        }));
      })
      .catch(() => {
        if (!cancelled) setBySession((prev) => ({ ...prev, [sid]: { status: "error" } }));
      });
    return () => {
      cancelled = true;
    };
  }, [router.isReady, sid]);

  const remote = sid ? bySession[sid]?.status ?? "pending" : "invalid";
  const paidPlanId = sid ? bySession[sid]?.planId : null;
  const studioPath = sid ? bySession[sid]?.studioPath || "/studio" : "/studio";

  const status = !router.isReady
    ? "loading"
    : !sid
      ? "invalid"
      : remote === "pending"
        ? "loading"
        : remote;

  return (
    <MinimalAppChrome>
      <Head>
        <title>{t.successVerifying} · Resumora</title>
        <meta name="description" content={t.successWait} />
      </Head>
      <main className="rs-app-shell rs-app-shell--minimal-main">
        <section className="rs-simple-card" style={{ textAlign: "center" }}>
          {status === "loading" && (
            <>
              <h1>{t.successVerifying}</h1>
              <p>{t.successWait}</p>
            </>
          )}

          {status === "success" && (
            <>
              <h1>{t.successPaymentTitle}</h1>
              <p>{t.successThanks}</p>
              <p>{t.successVerified}</p>
              {paidPlanId ? (
                <>
                  <p className="rs-success-ea-hint">
                    {paidPlanId === "essential_advanced" ? t.successEaStudioHint : t.successClientHubHint}
                  </p>
                  <p>
                    <Link href={studioPath} className="rs-btn-accent">
                      {paidPlanId === "essential_advanced" ? t.successEaStudioCta : t.successClientHubCta}
                    </Link>
                  </p>
                  <p>
                    <Link href="/studio" className="rs-link-muted">
                      {t.successClientHubCta}
                    </Link>
                  </p>
                </>
              ) : null}
              <p className="rs-success-private-hint">{t.successPrivateFeedbackHint}</p>
              <p className="rs-success-private-cta">
                <a
                  href={`mailto:${t.footerEmail}?subject=${encodeURIComponent("Private feedback (Resumora client)")}`}
                  className="rs-btn-ghost"
                >
                  {t.successPrivateFeedbackCta}
                </a>
              </p>
              <Link href="/" className="rs-link-muted">
                {t.returnHome}
              </Link>
            </>
          )}

          {status === "invalid" && (
            <>
              <h1>{t.successInvalidTitle}</h1>
              <p>{t.successInvalidLead}</p>
              <Link href="/" className="rs-link-muted">
                {t.returnHome}
              </Link>
            </>
          )}

          {status === "error" && (
            <>
              <h1>{t.successErrorTitle}</h1>
              <p>{t.successErrorLead}</p>
              <Link href="/" className="rs-link-muted">
                {t.returnHome}
              </Link>
            </>
          )}
        </section>
      </main>
    </MinimalAppChrome>
  );
}
