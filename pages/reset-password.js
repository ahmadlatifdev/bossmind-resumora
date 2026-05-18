import { useEffect, useState } from "react";
import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import MinimalAppChrome from "@/components/marketing/MinimalAppChrome";
import { useLanguage } from "@/context/LanguageContext";
import { getPostAuthRedirectPath } from "@/lib/marketing/checkout-plan-persistence";
import { translations } from "@/lib/marketing/site-copy";

function firstQuery(value) {
  if (typeof value === "string") return value;
  if (Array.isArray(value) && typeof value[0] === "string") return value[0];
  return "";
}

export default function ResetPasswordPage() {
  const router = useRouter();
  const { lang } = useLanguage();
  const t = translations[lang];
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!router.isReady) return;
    const q = firstQuery(router.query.email);
    if (q) setEmail(q);
  }, [router.isReady, router.query.email]);

  async function onSubmit(e) {
    e.preventDefault();
    setError("");
    setMessage("");
    const fd = new FormData(e.currentTarget);
    const code = String(fd.get("code") || "");
    const password = String(fd.get("password") || "");
    const confirm = String(fd.get("confirm") || "");
    const accountEmail = String(fd.get("email") || email);

    if (password.length < 8) {
      setError(t.resetPasswordTooShort);
      return;
    }
    if (password !== confirm) {
      setError(t.resetPasswordMismatch);
      return;
    }

    setBusy(true);
    try {
      const verifyRes = await fetch("/api/engagement/password-reset/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: accountEmail, code }),
      });
      if (!verifyRes.ok) {
        setError(t.resetPasswordInvalidCode);
        return;
      }

      const res = await fetch("/api/engagement/password-reset/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ email: accountEmail, code, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data.error === "password_too_short") setError(t.resetPasswordTooShort);
        else if (data.error === "invalid_code" || data.error === "code_expired") setError(t.resetPasswordInvalidCode);
        else setError(t.errLoginGeneric);
        return;
      }
      setMessage(t.resetPasswordSuccess);
      await router.push(getPostAuthRedirectPath(router));
    } finally {
      setBusy(false);
    }
  }

  return (
    <MinimalAppChrome>
      <Head>
        <title>{t.resetPasswordTitle} · Resumora</title>
        <meta name="description" content={t.resetPasswordSubtitle} />
      </Head>
      <main className="rs-app-shell rs-app-shell--minimal-main" id="reset-password-main">
        <section className="rs-simple-card">
          <h1>{t.resetPasswordTitle}</h1>
          <p>{t.resetPasswordSubtitle}</p>
          <form className="rs-form-grid" onSubmit={onSubmit}>
            <input className="rs-input" name="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t.loginEmail} required />
            <input className="rs-input" name="code" inputMode="numeric" placeholder={t.resetPasswordCode} required />
            <input className="rs-input" name="password" type="password" placeholder={t.resetPasswordNew} autoComplete="new-password" required />
            <input className="rs-input" name="confirm" type="password" placeholder={t.resetPasswordConfirm} autoComplete="new-password" required />
            <button className="rs-btn-primary" type="submit" disabled={busy}>
              {t.resetPasswordSubmit}
            </button>
          </form>
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
          <Link href="/forgot-password" className="rs-link-muted">
            {t.forgotPasswordTitle}
          </Link>
        </section>
      </main>
    </MinimalAppChrome>
  );
}
