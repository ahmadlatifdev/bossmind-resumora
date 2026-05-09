import { useState } from "react";
import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import MinimalAppChrome from "@/components/marketing/MinimalAppChrome";
import { useLanguage } from "@/context/LanguageContext";
import { translations } from "@/lib/marketing/site-copy";

export default function RegisterPage() {
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
      displayName: String(fd.get("displayName") || ""),
    };
    const res = await fetch("/api/engagement/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (data.error === "email_in_use") setError(t.errEmailInUse);
      else setError(typeof data.error === "string" ? data.error : t.errRegisterGeneric);
      return;
    }
    setMessage(t.registerCreated);
    router.push("/dashboard");
  }

  return (
    <MinimalAppChrome>
      <Head>
        <title>{t.registerTitle} · Resumora</title>
        <meta name="description" content={t.registerSubtitle} />
      </Head>
      <main className="rs-app-shell rs-app-shell--minimal-main">
        <section className="rs-simple-card">
          <h1>{t.registerTitle}</h1>
          <p>{t.registerSubtitle}</p>
          <form className="rs-form-grid" onSubmit={onSubmit}>
            <input className="rs-input" name="displayName" type="text" placeholder={t.registerName} autoComplete="name" />
            <input className="rs-input" name="email" type="email" placeholder={t.loginEmail} autoComplete="email" required />
            <input
              className="rs-input"
              name="password"
              type="password"
              placeholder={t.loginPassword}
              autoComplete="new-password"
              required
              minLength={8}
            />
            <button className="rs-btn-primary" type="submit">
              {t.registerSubmit}
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
