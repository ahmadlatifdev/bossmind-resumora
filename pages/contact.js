import Head from "next/head";
import Link from "next/link";
import SiteChrome from "@/components/marketing/SiteChrome";
import { useLanguage } from "@/context/LanguageContext";
import { translations } from "@/lib/marketing/site-copy";

export default function ContactPage() {
  const { lang } = useLanguage();
  const t = translations[lang];

  return (
    <SiteChrome>
      <Head>
        <title>{t.contactPageTitle} · Resumora</title>
        <meta name="description" content={t.contactMetaDescription} />
      </Head>
      <main className="rs-section">
        <div className="rs-container rs-contact-simple">
          <h1 className="rs-page-title">{t.contactPageTitle}</h1>
          <p className="rs-contact-email-line">
            <a href={`mailto:${t.footerEmail}`} className="rs-contact-email-link">
              {t.footerEmail}
            </a>
          </p>
          <p className="rs-contact-hours">{t.contactHours247}</p>
          <p className="rs-contact-autoreply">{t.contactAutoConfirm}</p>
          <div className="rs-contact-actions">
            <Link href="/chat" className="rs-btn-accent rs-contact-chat-btn">
              {t.contactChatCta}
            </Link>
          </div>
        </div>
      </main>
    </SiteChrome>
  );
}
