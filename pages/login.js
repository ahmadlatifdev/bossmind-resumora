import { useState } from "react";
import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import MinimalAppChrome from "@/components/marketing/MinimalAppChrome";
import { useLanguage } from "@/context/LanguageContext";
import { getPostAuthRedirectPath } from "@/lib/marketing/checkout-plan-persistence";
import { translations } from "@/lib/marketing/site-copy";

export default function LoginPage() {
  const router = useRouter();
  const { lang } = useLanguage();
  const t = translations[lang];
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function onSubmit(e) {
    e.preventDefault();
    setMessage("");
    setError("");
    const fd = new FormData(e.currentTarget);
    const body = {
      email: String(fd.get("email") || ""),
      password: String(fd.get("password") || ""),
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
      else setError(typeof data.error === "string" ? data.error : t.errLoginGeneric);
      return;
    }
    setMessage(t.loginSignedIn);
    await router.push(getPostAuthRedirectPath(router));
  }

  return (
    <MinimalAppChrome>
      <Head>
        <title>{t.loginTitle} · Resumora</title>
        <meta name="description" content={t.loginSubtitle} />
      </Head>
      <main className="rs-app-shell rs-app-shell--minimal-main">
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
