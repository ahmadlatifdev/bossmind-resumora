import Head from "next/head";
import MinimalAppChrome from "@/components/marketing/MinimalAppChrome";
import ClientStudioHub from "@/components/client/ClientStudioHub";
import { useLanguage } from "@/context/LanguageContext";
import { translations } from "@/lib/marketing/site-copy";

export default function ClientStudioHubPage() {
  const { lang } = useLanguage();
  const t = translations[lang];

  return (
    <MinimalAppChrome>
      <Head>
        <title>{t.clientHubTitle} · Resumora</title>
        <meta name="robots" content="noindex" />
      </Head>
      <main className="rs-app-shell rs-app-shell--minimal-main rs-client-hub-wrap">
        <ClientStudioHub lang={lang} />
      </main>
    </MinimalAppChrome>
  );
}
