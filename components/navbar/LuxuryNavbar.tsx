"use client";

import { useState } from "react";

import styles from "@/styles/luxury/navbar.module.css";

const LINKS = [
  { href: "#hero", label: "Home" },
  { href: "#testimonials", label: "Testimonials" },
  { href: "#faq", label: "FAQ" },
];

type LuxuryNavbarProps = {
  langToggle?: React.ReactNode;
};

export default function LuxuryNavbar({ langToggle }: LuxuryNavbarProps) {
  const [open, setOpen] = useState(false);

  return (
    <header className={styles.navbar}>
      <div className="lux-container">
        <div className={`lux-glass ${styles.navbarInner}`}>
          <a href="#hero" className={styles.brand}>
            <span className={styles.brandMark} aria-hidden="true" />
            <span>Resumora</span>
          </a>

          <nav aria-label="Primary">
            <ul className={styles.navLinks}>
              {LINKS.map((link) => (
                <li key={link.href}>
                  <a href={link.href} className={styles.navLink}>
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          <div className={styles.navActions}>
            {langToggle}
            <a href="#hero" className={styles.navCta}>
              Get Started
            </a>
            <button
              type="button"
              className={styles.menuButton}
              aria-expanded={open}
              aria-label="Toggle menu"
              onClick={() => setOpen((v) => !v)}
            >
              ☰
            </button>
          </div>
        </div>

        <div
          className={`lux-glass ${styles.mobilePanel} ${open ? styles.mobilePanelOpen : ""}`}
        >
          {LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className={styles.mobileLink}
              onClick={() => setOpen(false)}
            >
              {link.label}
            </a>
          ))}
        </div>
      </div>
    </header>
  );
}
