import Head from "next/head";
import Link from "next/link";
import MinimalAppChrome from "@/components/marketing/MinimalAppChrome";
import { useLanguage } from "@/context/LanguageContext";
import { supportPageCopy } from "@/lib/marketing/legal-copy";
import { translations } from "@/lib/marketing/site-copy";

export default function SupportPage() {
  const { lang } = useLanguage();
  const t = translations[lang];
  const c = supportPageCopy(lang);

  return (
    <MinimalAppChrome>
      <Head>
        <title>{c.title} · Resumora</title>
        <meta name="description" content={c.meta} />
      </Head>
      <main className="rs-app-shell rs-app-shell--minimal-main">
        <section className="rs-simple-card rs-simple-card--wide">
          <h1>{c.title}</h1>
          {c.paragraphs.map((p, i) => (
            <p key={i} style={{ marginTop: "1rem", color: "var(--rs-text-secondary)", lineHeight: 1.75 }}>
              {p}
            </p>
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
