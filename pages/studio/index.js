import Head from "next/head";
import dynamic from "next/dynamic";
import MinimalAppChrome from "@/components/marketing/MinimalAppChrome";
import StudioCalmPrepare from "@/components/client/StudioCalmPrepare";
import { useLanguage } from "@/context/LanguageContext";
import { translations } from "@/lib/marketing/site-copy";

function StudioHubFallback() {
  const { lang } = useLanguage();
  const safeLang = lang === "fr" ? "fr" : "en";
  return (
    <div className="rs-client-hub rs-client-hub--calm-prepare">
      <StudioCalmPrepare lang={safeLang} />
    </div>
  );
}

const ClientStudioHub = dynamic(() => import("@/components/client/ClientStudioHub"), {
  ssr: false,
  loading: () => <StudioHubFallback />,
});

/** Client studio — client-only bundle to avoid hydration mismatch after Stripe redirect. */
export default function ClientStudioHubPage() {
  const { lang } = useLanguage();
  const safeLang = lang === "fr" ? "fr" : "en";
  const t = translations[safeLang] || translations.en;

  return (
    <MinimalAppChrome>
      <Head>
        <title>{t.clientHubTitle} · Resumora</title>
        <meta name="robots" content="noindex" />
      </Head>
      <main className="rs-app-shell rs-app-shell--minimal-main rs-client-hub-wrap">
        <ClientStudioHub lang={safeLang} />
      </main>
    </MinimalAppChrome>
  );
}
