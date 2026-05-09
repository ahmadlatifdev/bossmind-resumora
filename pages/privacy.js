import Head from "next/head";
import Link from "next/link";
import MinimalAppChrome from "@/components/marketing/MinimalAppChrome";
import { useLanguage } from "@/context/LanguageContext";
import { privacyPolicyCopy } from "@/lib/marketing/legal-copy";
import { translations } from "@/lib/marketing/site-copy";

export default function PrivacyPage() {
  const { lang } = useLanguage();
  const t = translations[lang];
  const c = privacyPolicyCopy(lang);

  return (
    <MinimalAppChrome>
      <Head>
        <title>{c.title} · Resumora</title>
        <meta name="description" content={c.meta} />
      </Head>
      <main className="rs-app-shell rs-app-shell--minimal-main">
        <section className="rs-simple-card rs-simple-card--wide">
          <h1>{c.title}</h1>
          {c.sections.map((sec) => (
            <div key={sec.h} style={{ marginTop: "1.25rem" }}>
              <h2 className="rs-legal-h2" style={{ fontSize: "1.05rem", marginBottom: "0.5rem" }}>
                {sec.h}
              </h2>
              <p style={{ color: "var(--rs-text-secondary)", lineHeight: 1.75 }}>{sec.p}</p>
            </div>
          ))}
          <p style={{ marginTop: "1.5rem" }}>
            <Link href="/" className="rs-link-muted">
              {t.backHome}
            </Link>
          </p>
        </section>
      </main>
    </MinimalAppChrome>
  );
}
