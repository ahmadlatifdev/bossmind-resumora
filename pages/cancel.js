import Head from "next/head";
import Link from "next/link";
import MinimalAppChrome from "@/components/marketing/MinimalAppChrome";
import { useLanguage } from "@/context/LanguageContext";
import { translations } from "@/lib/marketing/site-copy";

export default function Cancel() {
  const { lang } = useLanguage();
  const t = translations[lang];

  return (
    <MinimalAppChrome>
      <Head>
        <title>{t.cancelTitle} · Resumora</title>
        <meta name="description" content={t.cancelLead} />
      </Head>
      <main className="rs-app-shell rs-app-shell--minimal-main">
        <section className="rs-simple-card" style={{ textAlign: "center" }}>
          <h1>{t.cancelTitle}</h1>
          <p>{t.cancelLead}</p>
          <p>
            {t.cancelBodyPrefix}{" "}
            <Link href="/" className="rs-shell-link">
              Resumora
            </Link>{" "}
            {t.cancelBodySuffix}
          </p>
        </section>
      </main>
    </MinimalAppChrome>
  );
}
