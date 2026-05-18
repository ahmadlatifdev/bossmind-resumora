import Head from "next/head";
import MinimalAppChrome from "@/components/marketing/MinimalAppChrome";
import EssentialAdvancedStudio from "@/components/essential-advanced/EssentialAdvancedStudio";
import { useLanguage } from "@/context/LanguageContext";
import { translations } from "@/lib/marketing/site-copy";

export default function EssentialAdvancedStudioPage() {
  const { lang } = useLanguage();
  const t = translations[lang];

  return (
    <MinimalAppChrome>
      <Head>
        <title>{t.eaStudioTitle} · Resumora</title>
        <meta name="robots" content="noindex" />
      </Head>
      <main className="rs-app-shell rs-app-shell--minimal-main rs-ea-studio-wrap">
        <EssentialAdvancedStudio lang={lang} />
      </main>
    </MinimalAppChrome>
  );
}
