import Image from "next/image";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import { useState } from "react";
import { useLanguage } from "@/context/LanguageContext";
import { translations } from "@/lib/marketing/site-copy";
import InstallPrompt from "@/components/marketing/InstallPrompt";

export default function SiteChrome({ children }) {
  const { lang, setLang } = useLanguage();
  const t = translations[lang];
  const [menuOpen, setMenuOpen] = useState(false);
  const closeMenu = () => setMenuOpen(false);

  const navLinks = (
    <>
      <Link href="/" onClick={closeMenu}>
        {t.navHome}
      </Link>
      <Link href="/services" onClick={closeMenu}>
        {t.navServices}
      </Link>
      <Link href="/pricing" onClick={closeMenu}>
        {t.navPricing}
      </Link>
      <Link href="/global-reach" onClick={closeMenu}>
        {t.navCountries}
      </Link>
      <Link href="/capabilities" onClick={closeMenu}>
        {t.navCapabilities}
      </Link>
      <Link href="/delivery-protocols" onClick={closeMenu}>
        {t.navDelivery}
      </Link>
      <Link href="/client-engagement" onClick={closeMenu}>
        {t.navEngagement}
      </Link>
      <Link href="/testimonials" onClick={closeMenu}>
        {t.navTestimonials}
      </Link>
      <Link href="/marketing" onClick={closeMenu}>
        {t.navWeekly}
      </Link>
      <Link href="/contact" onClick={closeMenu}>
        {t.navContact}
      </Link>
    </>
  );

  return (
    <div className="rs-page">
      <div className="rs-bg" aria-hidden />

      <header className="rs-header">
        <div className="rs-header-inner">
          <Link href="/" className="rs-brand" aria-label="Resumora home">
            <Image
              src="/resumora-logo.png"
              alt="Resumora"
              width={210}
              height={48}
              priority
              className="rs-logo"
              sizes="210px"
            />
          </Link>

          <nav className="rs-nav-desktop rs-nav-wide" aria-label="Primary">
            {navLinks}
          </nav>

          <div className="rs-header-actions">
            <button
              type="button"
              className="rs-lang"
              data-active={lang === "en"}
              onClick={() => setLang("en")}
              aria-pressed={lang === "en"}
            >
              EN
            </button>
            <button
              type="button"
              className="rs-lang"
              data-active={lang === "fr"}
              onClick={() => setLang("fr")}
              aria-pressed={lang === "fr"}
            >
              FR
            </button>
            <Link href="/login" className="rs-btn-ghost rs-hide-tablet-auth">
              {t.navLogin}
            </Link>
            <Link href="/register" className="rs-btn-accent rs-hide-tablet-auth">
              {t.navRegister}
            </Link>
            <button
              type="button"
              className="rs-menu-toggle hide-lg"
              onClick={() => setMenuOpen((v) => !v)}
              aria-expanded={menuOpen}
              aria-label={menuOpen ? t.closeMenu : t.openMenu}
            >
              {menuOpen ? <X className="rs-icon-gold" size={22} strokeWidth={1.5} /> : <Menu className="rs-icon-gold" size={22} strokeWidth={1.5} />}
            </button>
          </div>
        </div>

        <div className="rs-mobile-panel" data-open={menuOpen ? "true" : "false"}>
          <nav aria-label="Mobile primary">{navLinks}</nav>
          <div className="rs-mobile-actions">
            <Link href="/login" className="rs-btn-ghost" onClick={closeMenu}>
              {t.navLogin}
            </Link>
            <Link href="/register" className="rs-btn-accent" onClick={closeMenu}>
              {t.navRegister}
            </Link>
          </div>
        </div>
      </header>

      {children}

      <InstallPrompt />

      <footer className="rs-footer">
        <div className="rs-footer-grid">
          <div className="rs-footer-col">
            <div style={{ marginBottom: "0.75rem" }}>
              <Image src="/resumora-logo.png" alt="" width={160} height={36} className="rs-logo" sizes="160px" />
            </div>
            <p style={{ margin: 0, fontSize: "0.9rem", lineHeight: 1.65, color: "var(--rs-text-secondary)", maxWidth: "32ch" }}>{t.footerTagline}</p>
          </div>
          <div className="rs-footer-col">
            <h4>{t.footerColProduct}</h4>
            <ul className="rs-footer-links">
              <li>
                <Link href="/services">{t.footerServices}</Link>
              </li>
              <li>
                <Link href="/pricing">{t.footerPricing}</Link>
              </li>
              <li>
                <Link href="/capabilities">{t.footerCapabilities}</Link>
              </li>
              <li>
                <Link href="/global-reach">{t.footerRegions}</Link>
              </li>
              <li>
                <Link href="/delivery-protocols">{t.footerDelivery}</Link>
              </li>
              <li>
                <Link href="/client-engagement">{t.footerEngagement}</Link>
              </li>
              <li>
                <Link href="/testimonials">{t.footerStories}</Link>
              </li>
              <li>
                <Link href="/marketing">{t.footerWeekly}</Link>
              </li>
            </ul>
          </div>
          <div className="rs-footer-col">
            <h4>{t.footerColCompany}</h4>
            <ul className="rs-footer-links">
              <li>
                <Link href="/about">{t.footerAbout}</Link>
              </li>
              <li>
                <Link href="/contact">{t.footerContact}</Link>
              </li>
              <li>
                <Link href="/support">{t.footerSupport}</Link>
              </li>
              <li>
                <Link href="/dashboard">{lang === "en" ? "Dashboard" : "Tableau"}</Link>
              </li>
            </ul>
          </div>
          <div className="rs-footer-col">
            <h4>{t.footerColLegal}</h4>
            <ul className="rs-footer-links">
              <li>
                <Link href="/terms">{t.footerTerms}</Link>
              </li>
              <li>
                <Link href="/privacy">{t.footerPrivacy}</Link>
              </li>
            </ul>
          </div>
        </div>
        <div className="rs-footer-meta">{t.footerCopy}</div>
      </footer>
    </div>
  );
}
