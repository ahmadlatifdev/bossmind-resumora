import Head from "next/head";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import MinimalAppChrome from "@/components/marketing/MinimalAppChrome";
import { useLanguage } from "@/context/LanguageContext";
import { translations } from "@/lib/marketing/site-copy";

export default function DashboardPage() {
  const router = useRouter();
  const { lang } = useLanguage();
  const t = translations[lang];
  const [data, setData] = useState(null);
  const [journey, setJourney] = useState(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/client/onboarding?lang=${lang}`, { credentials: "same-origin" })
      .then((r) => r.json())
      .then((j) => {
        if (!cancelled) setJourney(j);
        if (!cancelled && j?.signedIn && j?.next?.path && j.next.path !== "/dashboard") {
          router.replace(j.next.path).catch(() => {});
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [lang, router]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/engagement/stats", { credentials: "same-origin" })
      .then((r) => r.json())
      .then((j) => {
        if (!cancelled) setData(j);
      })
      .catch(() => {
        if (!cancelled) setData({ enabled: false });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function logout() {
    await fetch("/api/engagement/logout", { method: "POST", credentials: "same-origin" });
    window.location.href = "/";
  }

  const signedLabel = data?.signedIn ? data.email || t.dashboardSession : t.dashboardAnonymous;
  const neonLabel =
    data?.enabled === false ? t.dashboardNeonOffline : data?.enabled === true ? t.dashboardNeonOnline : "—";

  return (
    <MinimalAppChrome>
      <Head>
        <title>{t.dashboardTitle} · Resumora</title>
        <meta name="description" content={t.dashboardLead.slice(0, 155)} />
      </Head>
      <main className="rs-app-shell rs-app-shell--minimal-main">
        <section className="rs-simple-card rs-simple-card--wide rs-dash-board-card">
          <h1>{t.dashboardTitle}</h1>
          <p style={{ marginTop: "0.75rem", color: "var(--rs-text-secondary)", lineHeight: 1.65 }}>
            {t.dashboardLead} <strong>{signedLabel}</strong>.
          </p>
          <div style={{ marginTop: "1.5rem", display: "grid", gap: "0.75rem" }}>
            <div>
              <strong>{t.dashboardFollowers}</strong> {data?.followers ?? "—"}
            </div>
            <div>
              <strong>{t.dashboardProfiles}</strong> {data?.registrations ?? "—"}
            </div>
            <div>
              <strong>{t.dashboardNeon}</strong> {neonLabel}
            </div>
          </div>
          {journey?.next?.path ? (
            <p style={{ marginTop: "1rem" }}>
              <Link href={journey.next.path} className="rs-btn-accent" style={{ textDecoration: "none", display: "inline-flex" }}>
                {journey.next.label || (lang === "fr" ? "Continuer" : "Continue")}
              </Link>
            </p>
          ) : null}
          <div style={{ marginTop: "1.5rem", display: "flex", flexWrap: "wrap", gap: "0.65rem" }}>
            <Link href="/studio" className="rs-btn-accent" style={{ textDecoration: "none", display: "inline-flex" }}>
              {lang === "fr" ? "Mon studio CV" : "My Resume Studio"}
            </Link>
            <Link href="/client-engagement" className="rs-btn-ghost" style={{ textDecoration: "none", display: "inline-flex" }}>
              {t.dashboardBackEngagement}
            </Link>
            <button type="button" className="rs-btn-ghost" onClick={() => logout()}>
              {t.dashboardSignOut}
            </button>
            <Link href="/" className="rs-link-muted" style={{ alignSelf: "center" }}>
              {t.navHomeShort}
            </Link>
          </div>
        </section>
      </main>
    </MinimalAppChrome>
  );
}
