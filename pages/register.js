import { useEffect, useMemo, useState } from "react";
import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import MinimalAppChrome from "@/components/marketing/MinimalAppChrome";
import { useLanguage } from "@/context/LanguageContext";
import {
  getPostAuthRedirectPath,
  normalizeCheckoutPlanId,
  setPendingCheckoutPlan,
} from "@/lib/marketing/checkout-plan-persistence";
import { pricingPlans, translations } from "@/lib/marketing/site-copy";
import { freeEditsLabel } from "@/lib/client/plan-policy";
import { trackGa4 } from "@/lib/marketing/resumora-ga4-events";

function firstQuery(value) {
  if (typeof value === "string") return value;
  if (Array.isArray(value) && typeof value[0] === "string") return value[0];
  return "";
}

export async function getServerSideProps(ctx) {
  const raw = ctx.query?.plan;
  const one = typeof raw === "string" ? raw : Array.isArray(raw) ? raw[0] : "";
  const initialPlan = normalizeCheckoutPlanId(one) || null;
  return { props: { initialPlan } };
}

export default function RegisterPage({ initialPlan = null }) {
  const router = useRouter();
  const { lang } = useLanguage();
  const t = translations[lang];
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!router.isReady) return;
    const p = normalizeCheckoutPlanId(firstQuery(router.query.plan));
    if (p) setPendingCheckoutPlan(p);
    else if (initialPlan) setPendingCheckoutPlan(initialPlan);
  }, [router.isReady, router.query.plan, initialPlan]);

  const planMeta = useMemo(() => {
    const fromRouter = router.isReady ? normalizeCheckoutPlanId(firstQuery(router.query.plan)) : "";
    const id = fromRouter || normalizeCheckoutPlanId(initialPlan) || "";
    return id ? pricingPlans.find((p) => p.id === id) || null : null;
  }, [router.isReady, router.query.plan, initialPlan]);

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
      else if (data.error === "Database unavailable" && data.recoveryHint) {
        setError(`${t.errRegisterGeneric} (${data.recoveryHint})`);
      } else setError(typeof data.error === "string" ? data.error : t.errRegisterGeneric);
      return;
    }
    trackGa4("sign_up", { method: "engagement_register" });
    setMessage(t.registerCreated);
    try {
      const ob = await fetch(`/api/client/onboarding?lang=${lang}`, { credentials: "same-origin" });
      const journey = await ob.json();
      if (journey?.next?.path) {
        await router.push(journey.next.path);
        return;
      }
    } catch {
      /* fallback */
    }
    await router.push(getPostAuthRedirectPath(router));
  }

  return (
    <MinimalAppChrome>
      <Head>
        <title>{t.registerTitle} · Resumora</title>
        <meta name="description" content={t.registerSubtitle} />
      </Head>
      <main
        className="rs-app-shell rs-app-shell--minimal-main"
        id="register-main"
        data-rs-register-ready={router.isReady ? "1" : "0"}
      >
        <div className={`rs-register-layout${planMeta ? " rs-register-layout--split" : ""}`}>
          <section className="rs-simple-card">
            <h1>{t.registerTitle}</h1>
            <p>{t.registerSubtitle}</p>
            <form className="rs-form-grid" onSubmit={onSubmit}>
              <input
                className="rs-input"
                name="displayName"
                type="text"
                placeholder={t.registerName}
                autoComplete="name"
              />
              <input
                className="rs-input"
                name="email"
                type="email"
                placeholder={t.loginEmail}
                autoComplete="email"
                required
              />
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

          {planMeta ? (
            <section className="rs-simple-card rs-register-plan-card" aria-labelledby="register-plan-heading">
              <p className="rs-eyebrow" style={{ marginBottom: "0.35rem" }}>
                {t.registerPlanEyebrow}
              </p>
              <p style={{ margin: 0, color: "var(--rs-text-secondary)", fontSize: "0.95rem" }}>{t.registerPlanLead}</p>
              <h2 id="register-plan-heading" className="rs-h2" style={{ fontSize: "clamp(1.25rem, 2.5vw, 1.55rem)", marginTop: "0.65rem" }}>
                {planMeta.name[lang]} · <span style={{ color: "var(--rs-gold-soft)" }}>{planMeta.price}</span>
              </h2>
              <p style={{ margin: "0.35rem 0 0", fontSize: "0.82rem", color: "var(--rs-text-muted)" }}>{t.registerPlanPriceNote}</p>
              {planMeta.freeEdits ? (
                <p className="rs-register-free-edits">{freeEditsLabel(planMeta.id, lang)}</p>
              ) : null}
              <ul className="rs-register-plan-features">
                {(planMeta.features[lang] || planMeta.features.en).slice(0, 6).map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
              <p style={{ margin: "1rem 0 0", fontSize: "0.9rem", lineHeight: 1.55, color: "var(--rs-text-secondary)" }}>
                {t.registerPlanAfterAccount}
              </p>
              <div style={{ marginTop: "1rem", display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
                <Link href="/pricing" className="rs-btn-ghost">
                  {t.registerPlanViewPricing}
                </Link>
              </div>
            </section>
          ) : null}
        </div>
      </main>
    </MinimalAppChrome>
  );
}
