import { useEffect, useState } from "react";
import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import MinimalAppChrome from "@/components/marketing/MinimalAppChrome";
import { useLanguage } from "@/context/LanguageContext";
import {
  normalizeCheckoutPlanId,
  setPendingCheckoutPlan,
} from "@/lib/marketing/checkout-plan-persistence";
import {
  extractSessionIdFromPath,
  getStoredCheckoutSessionId,
  hasPaidCheckoutPending,
  persistCheckoutSessionId,
  resolvePostAuthRedirect,
} from "@/lib/marketing/post-auth-redirect";
import { translations } from "@/lib/marketing/site-copy";

function firstQuery(value) {
  if (typeof value === "string") return value;
  if (Array.isArray(value) && typeof value[0] === "string") return value[0];
  return "";
}

export default function LoginPage() {
  const router = useRouter();
  const { lang } = useLanguage();
  const t = translations[lang];
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!router.isReady) return;
    const p = normalizeCheckoutPlanId(firstQuery(router.query.plan));
    if (p) setPendingCheckoutPlan(p);
    const next = firstQuery(router.query.next);
    const sid = extractSessionIdFromPath(next) || getStoredCheckoutSessionId();
    if (sid) persistCheckoutSessionId(sid);
  }, [router.isReady, router.query.plan, router.query.next]);

  useEffect(() => {
    if (!router.isReady) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`/api/client/workspace?lang=${lang}`, { credentials: "same-origin" });
        const data = await r.json().catch(() => ({}));
        if (cancelled || !data?.signedIn) return;
        const sid = extractSessionIdFromPath(firstQuery(router.query.next)) || getStoredCheckoutSessionId();
        const target = sid
          ? `/studio?session_id=${encodeURIComponent(sid)}`
          : resolvePostAuthRedirect(router);
        await router.replace(target);
      } catch {
        /* not signed in */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router.isReady, router.query.next, lang, router]);

  async function onSubmit(e) {
    e.preventDefault();
    setMessage("");
    setError("");
    const fd = new FormData(e.currentTarget);
    const stripeSessionId =
      extractSessionIdFromPath(firstQuery(router.query.next)) || getStoredCheckoutSessionId();
    const body = {
      email: String(fd.get("email") || ""),
      password: String(fd.get("password") || ""),
      stripe_session_id: stripeSessionId || undefined,
      lang,
    };
    const res = await fetch("/api/engagement/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (data.error === "invalid_credentials") setError(t.errInvalidCredentials);
      else if (data.failedStep === "auth_email_mismatch") {
        setError(
          lang === "fr"
            ? "Utilisez l'email utilise lors du paiement Stripe."
            : "Sign in with the same email you used for Stripe checkout."
        );
      } else setError(typeof data.error === "string" ? data.error : t.errLoginGeneric);
      return;
    }

    setMessage(t.loginSignedIn);

    const redirectPath = resolvePostAuthRedirect(router);
    const paidPending = hasPaidCheckoutPending(router) || Boolean(stripeSessionId);

    if (data.activation?.activationSuccess) {
      try {
        sessionStorage.setItem("rs_post_login", "1");
      } catch {
        /* ignore */
      }
      await router.replace("/studio");
      return;
    }

    if (!paidPending) {
      try {
        const qs = new URLSearchParams({ lang });
        if (stripeSessionId) qs.set("session_id", stripeSessionId);
        const ob = await fetch(`/api/client/onboarding?${qs.toString()}`, { credentials: "same-origin" });
        const journey = await ob.json();
        const nextPath = journey?.next?.path || "";
        if (nextPath && !nextPath.startsWith("/pricing")) {
          await router.replace(nextPath);
          return;
        }
      } catch {
        /* fallback */
      }
    }

    try {
      sessionStorage.setItem("rs_post_login", "1");
    } catch {
      /* ignore */
    }
    await router.replace(redirectPath);
  }

  return (
    <MinimalAppChrome>
      <Head>
        <title>{t.loginTitle} · Resumora</title>
        <meta name="description" content={t.loginSubtitle} />
      </Head>
      <main className="rs-app-shell rs-app-shell--minimal-main" id="login-main">
        <section className="rs-simple-card">
          <h1>{t.loginTitle}</h1>
          <p>{t.loginSubtitle}</p>
          <form className="rs-form-grid" onSubmit={onSubmit}>
            <input className="rs-input" name="email" type="email" placeholder={t.loginEmail} autoComplete="email" required />
            <input
              className="rs-input"
              name="password"
              type="password"
              placeholder={t.loginPassword}
              autoComplete="current-password"
              required
            />
            <button className="rs-btn-primary" type="submit">
              {t.loginSubmit}
            </button>
          </form>
          <p style={{ marginTop: "0.75rem", fontSize: "0.9rem" }}>
            <Link href="/forgot-password" className="rs-link-muted">
              {t.loginForgotLink}
            </Link>
          </p>
          {error ? (
            <p role="alert" style={{ color: "#f0a8a8", marginTop: "0.75rem", fontSize: "0.9rem" }}>
              {error}
            </p>
          ) : null}
          {message ? (
            <p role="status" style={{ color: "#7dd4a0", marginTop: "0.75rem", fontSize: "0.9rem" }}>
              {message}
            </p>
          ) : null}
          <Link href="/" className="rs-link-muted">
            {t.backHome}
          </Link>
        </section>
      </main>
    </MinimalAppChrome>
  );
}
