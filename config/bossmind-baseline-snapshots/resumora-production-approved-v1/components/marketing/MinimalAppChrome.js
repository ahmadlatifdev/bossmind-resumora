import Link from "next/link";
import ResumoraLogo from "@/components/brand/ResumoraLogo";
import FooterUniversalDock from "@/components/marketing/FooterUniversalDock";
import LanguageSwitcher from "@/components/marketing/LanguageSwitcher";
import { useLanguage } from "@/context/LanguageContext";
import { translations } from "@/lib/marketing/site-copy";

/**
 * Slim shell for auth/checkout/legal-simple pages: luxury bar with EN/FR top-right + optional footer lang.
 */
export default function MinimalAppChrome({ children }) {
  const { lang } = useLanguage();
  const t = translations[lang];

  return (
    <div className="rs-page rs-minimal-app">
      <div className="rs-bg" aria-hidden />

      <header className="rs-minimal-topbar">
        <ResumoraLogo
          variant="minimal"
          linkHome
          linkClassName="rs-minimal-topbar-brand"
          homeAriaLabel={t.minimalHomeAria}
        />
        <LanguageSwitcher />
      </header>

      {children}

      <footer className="rs-minimal-footer rs-minimal-footer--stack">
        <div className="rs-minimal-footer-row">
          <LanguageSwitcher variant="compact" />
          <Link href="/" className="rs-link-muted rs-minimal-footer-home">
            {t.backHome}
          </Link>
        </div>
        <FooterUniversalDock variant="minimal" />
      </footer>
    </div>
  );
}
