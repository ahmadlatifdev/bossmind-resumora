import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/router";
import { ChevronDown, Menu, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useLanguage } from "@/context/LanguageContext";
import { translations } from "@/lib/marketing/site-copy";
import FooterUniversalDock from "@/components/marketing/FooterUniversalDock";
import InstallPrompt from "@/components/marketing/InstallPrompt";
import LanguageSwitcher from "@/components/marketing/LanguageSwitcher";

function NavGroup({ title, open, onToggle, children }) {
  return (
    <div className="rs-nav-group">
      <button type="button" className="rs-nav-group-trigger" onClick={onToggle} aria-expanded={open}>
        <span>{title}</span>
        <ChevronDown className="rs-nav-group-chevron" data-open={open ? "true" : "false"} size={18} strokeWidth={1.75} aria-hidden />
      </button>
      {open ? <div className="rs-nav-group-panel">{children}</div> : null}
    </div>
  );
}

export default function SiteChrome({ children }) {
  const { lang } = useLanguage();
  const t = translations[lang];
  const router = useRouter();
  const pathname = router.pathname || "";
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sections, setSections] = useState({
    overview: true,
    product: true,
    experience: false,
    support: true,
  });

  useEffect(() => {
    const closeSidebar = () => setSidebarOpen(false);
    router.events.on("routeChangeComplete", closeSidebar);
    return () => router.events.off("routeChangeComplete", closeSidebar);
  }, [router]);

  const navGroups = useMemo(
    () => [
      {
        id: "overview",
        title: t.navGroupOverview,
        items: [{ href: "/", label: t.navHome }],
      },
      {
        id: "product",
        title: t.navGroupProduct,
        items: [
          { href: "/services", label: t.navServices },
          { href: "/capabilities", label: t.navCapabilities },
          { href: "/pricing", label: t.navPricing },
          { href: "/delivery-protocols", label: t.navDelivery },
        ],
      },
      {
        id: "experience",
        title: t.navGroupExperience,
        items: [
          { href: "/client-engagement", label: t.navEngagement },
          { href: "/testimonials", label: t.navTestimonials },
        ],
      },
      {
        id: "support",
        title: t.navGroupSupport,
        items: [
          { href: "/about", label: t.footerAbout },
          { href: "/contact", label: t.navContact },
          { href: "/support", label: t.footerSupport },
          { href: "/chat", label: t.footerLiveChat },
        ],
      },
    ],
    [t]
  );

  return (
    <div className="rs-page rs-app-layout">
      <div className="rs-bg" aria-hidden />

      <div className={`rs-sidebar-backdrop ${sidebarOpen ? "rs-sidebar-backdrop--open" : ""}`} onClick={() => setSidebarOpen(false)} aria-hidden />

      <aside className={`rs-sidebar ${sidebarOpen ? "rs-sidebar--open" : ""}`} aria-label={t.sidebarNavLabel}>
        <div className="rs-sidebar-brand">
          <Link href="/" className="rs-brand rs-brand-sidebar" onClick={() => setSidebarOpen(false)}>
            <Image
              src="/resumora-logo.png"
              alt="Resumora"
              width={315}
              height={72}
              priority
              className="rs-logo rs-logo-sidebar"
              sizes="(max-width: 1024px) 240px, 315px"
            />
          </Link>
        </div>

        <nav className="rs-sidebar-nav">
          {navGroups.map((group) => (
            <NavGroup
              key={group.id}
              title={group.title}
              open={sections[group.id]}
              onToggle={() => setSections((s) => ({ ...s, [group.id]: !s[group.id] }))}
            >
              <ul className="rs-sidebar-links">
                {group.items.map((item) => (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className="rs-sidebar-link"
                      data-active={pathname === item.href ? "true" : "false"}
                      onClick={() => setSidebarOpen(false)}
                    >
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </NavGroup>
          ))}
        </nav>

        <div className="rs-sidebar-footer">
          <Link href="/login" className="rs-sidebar-auth rs-sidebar-auth--ghost" onClick={() => setSidebarOpen(false)}>
            {t.navLogin}
          </Link>
          <Link href="/register" className="rs-sidebar-auth rs-sidebar-auth--accent" onClick={() => setSidebarOpen(false)}>
            {t.navRegister}
          </Link>
        </div>
      </aside>

      <div className="rs-main-column">
        <header className="rs-topbar">
          <button
            type="button"
            className="rs-sidebar-toggle hide-desktop-flex"
            onClick={() => setSidebarOpen((v) => !v)}
            aria-expanded={sidebarOpen}
            aria-label={sidebarOpen ? t.closeMenu : t.openMenu}
          >
            {sidebarOpen ? <X className="rs-icon-gold" size={22} strokeWidth={1.5} /> : <Menu className="rs-icon-gold" size={22} strokeWidth={1.5} />}
          </button>

          <Link href="/" className="rs-topbar-brand hide-desktop-flex" aria-label="Resumora home">
            <Image src="/resumora-logo.png" alt="" width={200} height={46} className="rs-logo rs-logo-topbar" sizes="200px" />
          </Link>

          <div className="rs-topbar-actions">
            <LanguageSwitcher />
            <Link href="/login" className="rs-btn-ghost rs-hide-mobile-inline">
              {t.navLogin}
            </Link>
            <Link href="/register" className="rs-btn-accent rs-hide-mobile-inline">
              {t.navRegister}
            </Link>
          </div>
        </header>

        {children}

        <InstallPrompt />

        <footer className="rs-footer rs-footer-enterprise rs-footer-minimal">
          <div className="rs-footer-enterprise-grid rs-footer-enterprise-grid--tight">
            <div className="rs-footer-block">
              <p className="rs-footer-wordmark">Resumora</p>
              <p className="rs-footer-about">{t.footerAboutLuxury}</p>
            </div>

            <div className="rs-footer-block">
              <h4 className="rs-footer-heading">{t.footerColReach}</h4>
              <p className="rs-footer-line">
                <a href={`mailto:${t.footerEmail}`} className="rs-footer-link">
                  {t.footerEmail}
                </a>
              </p>
              <p className="rs-footer-hours">{t.contactHours247}</p>
              <p className="rs-footer-line">
                <Link href="/chat" className="rs-footer-link">
                  {t.footerLiveChat}
                </Link>
              </p>
            </div>

            <div className="rs-footer-block">
              <h4 className="rs-footer-heading">{t.footerColLegal}</h4>
              <ul className="rs-footer-link-list">
                <li>
                  <Link href="/terms">{t.footerTerms}</Link>
                </li>
                <li>
                  <Link href="/privacy">{t.footerPrivacy}</Link>
                </li>
                <li>
                  <Link href="/refund">{t.footerRefund}</Link>
                </li>
                <li>
                  <Link href="/system-policy">{t.footerSystemPolicy}</Link>
                </li>
              </ul>
            </div>
          </div>

          <FooterUniversalDock />

          <div className="rs-footer-lang-row">
            <LanguageSwitcher variant="compact" />
          </div>
          <div className="rs-footer-meta">{t.footerCopy}</div>
        </footer>
      </div>
    </div>
  );
}
