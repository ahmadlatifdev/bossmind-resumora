import Head from "next/head";
import Link from "next/link";
import MinimalAppChrome from "@/components/marketing/MinimalAppChrome";
import { useLanguage } from "@/context/LanguageContext";
import { translations } from "@/lib/marketing/site-copy";

export default function AboutPage() {
  const { lang } = useLanguage();
  const t = translations[lang];

  return (
    <MinimalAppChrome>
      <Head>
        <title>{t.aboutTitle} · Resumora</title>
        <meta name="description" content={t.aboutLead1.slice(0, 155)} />
      </Head>
      <main className="rs-app-shell rs-app-shell--minimal-main">
        <section className="rs-simple-card rs-simple-card--wide">
          <h1>{t.aboutTitle}</h1>
          <p>{t.aboutLead1}</p>
          <p>{t.aboutLead2}</p>
          <Link href="/" className="rs-link-muted">
            {t.backHome}
          </Link>
        </section>
      </main>
    </MinimalAppChrome>
  );
}
