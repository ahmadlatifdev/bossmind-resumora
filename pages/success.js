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

  const [status, setStatus] = useState("loading");

  useEffect(() => {
    if (!router.isReady) return;
    if (!session_id) {
      setStatus("invalid");
      return;
    }
    fetch(`/api/verify-session?session_id=${encodeURIComponent(session_id)}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.valid) {
          setStatus("success");
        } else {
          setStatus("invalid");
        }
      })
      .catch(() => {
        setStatus("error");
      });
  }, [router.isReady, session_id]);

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
