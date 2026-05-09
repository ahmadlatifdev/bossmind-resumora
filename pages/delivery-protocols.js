import Link from "next/link";
import SiteChrome from "@/components/marketing/SiteChrome";
import DeliveryPanel from "@/components/marketing/sections/DeliveryPanel";
import { useLanguage } from "@/context/LanguageContext";
import { translations } from "@/lib/marketing/site-copy";

export default function DeliveryProtocolsPage() {
  const { lang } = useLanguage();
  const t = translations[lang];

  return (
    <SiteChrome>
      <main>
        <section className="rs-section">
          <div className="rs-container">
            <p className="rs-eyebrow">{t.navDelivery}</p>
            <h1 className="rs-page-title">{t.deliveryProtocolsTitle}</h1>
            <p className="rs-lead">{t.deliveryProtocolsSubtitle}</p>
            <div className="rs-hero-ctas">
              <Link href="/services#intake" className="rs-btn-accent">
                {t.footerUpload}
              </Link>
              <Link href="/pricing" className="rs-btn-ghost">
                {t.navPricing}
              </Link>
            </div>
          </div>
        </section>
        <DeliveryPanel />
      </main>
    </SiteChrome>
  );
}
