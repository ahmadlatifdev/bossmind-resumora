import Head from "next/head";
import SiteChrome from "@/components/marketing/SiteChrome";
import { useLanguage } from "@/context/LanguageContext";
import { refundCopy } from "@/lib/marketing/legal-copy";

export default function RefundPolicyPage() {
  const { lang } = useLanguage();
  const c = refundCopy(lang);

  return (
    <SiteChrome>
      <Head>
        <title>{c.title} · Resumora</title>
        <meta name="description" content={c.meta} />
      </Head>
      <main className="rs-section">
        <article className="rs-container rs-legal-wrap">
          <h1 className="rs-page-title">{c.title}</h1>
          <div className="rs-legal-body">
            {c.sections.map((sec) => (
              <section key={sec.h}>
                <h2 className="rs-legal-h2">{sec.h}</h2>
                <p>{sec.p}</p>
              </section>
            ))}
          </div>
        </article>
      </main>
    </SiteChrome>
  );
}
