"use client";

import { useState } from "react";

import LuxuryFooter from "@/components/footer/LuxuryFooter";
import FaqSection from "@/components/landing/FaqSection";
import TestimonialsSection from "@/components/landing/TestimonialsSection";
import LuxuryNavbar from "@/components/navbar/LuxuryNavbar";
import styles from "@/styles/luxury/landing.module.css";

type Lang = "en" | "fr";

const COPY = {
  en: {
    badge: "AI-Powered Enterprise",
    title: "Executive resumes, elevated by intelligence",
    subtitle:
      "Resumora delivers luxury-grade CV optimization for leaders who expect precision, discretion, and measurable career outcomes.",
    primaryCta: "Start Free Assessment",
    secondaryCta: "View Enterprise Plans",
    stats: [
      { value: "98%", label: "Client satisfaction" },
      { value: "24h", label: "Priority turnaround" },
      { value: "EN/FR", label: "Bilingual delivery" },
    ],
  },
  fr: {
    badge: "Entreprise propulsée par l'IA",
    title: "CV exécutifs, sublimés par l'intelligence",
    subtitle:
      "Resumora offre une optimisation de CV haut de gamme pour les leaders exigeant précision, discrétion et résultats mesurables.",
    primaryCta: "Commencer l'évaluation",
    secondaryCta: "Voir les offres entreprise",
    stats: [
      { value: "98%", label: "Satisfaction client" },
      { value: "24h", label: "Délai prioritaire" },
      { value: "EN/FR", label: "Livraison bilingue" },
    ],
  },
} as const;

export function LanguageToggle({
  lang,
  onChange,
}: {
  lang: Lang;
  onChange: (lang: Lang) => void;
}) {
  return (
    <div
      role="group"
      aria-label="Language toggle placeholder"
      style={{
        display: "inline-flex",
        padding: "0.2rem",
        borderRadius: "999px",
        border: "1px solid var(--lux-glass-border)",
        background: "rgba(255,255,255,0.04)",
      }}
    >
      {(["en", "fr"] as const).map((code) => (
        <button
          key={code}
          type="button"
          onClick={() => onChange(code)}
          aria-pressed={lang === code}
          style={{
            border: "none",
            cursor: "pointer",
            borderRadius: "999px",
            padding: "0.35rem 0.75rem",
            fontSize: "0.78rem",
            fontWeight: 600,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            color: lang === code ? "var(--lux-black)" : "var(--lux-muted)",
            background:
              lang === code
                ? "linear-gradient(135deg, var(--lux-gold-light), var(--lux-gold))"
                : "transparent",
          }}
        >
          {code}
        </button>
      ))}
    </div>
  );
}

export function HeroSection({ lang }: { lang: Lang }) {
  const copy = COPY[lang];

  return (
    <section id="hero" className={styles.hero}>
      <div className={styles.heroGlow} aria-hidden="true" />
      <div className="lux-container lux-animate-in">
        <span className={`lux-glass ${styles.heroBadge}`}>{copy.badge}</span>
        <h1 className={styles.heroTitle}>
          <span className="lux-gold-text">{copy.title.split(",")[0]},</span>
          {copy.title.includes(",") ? (
            <>
              <br />
              {copy.title.split(",").slice(1).join(",").trim()}
            </>
          ) : null}
        </h1>
        <p className={`${styles.heroSubtitle} lux-animate-in-delay`}>{copy.subtitle}</p>
        <div className={styles.ctaRow}>
          <a href="#faq" className={styles.ctaPrimary}>
            {copy.primaryCta}
          </a>
          <a href="#testimonials" className={styles.ctaSecondary}>
            {copy.secondaryCta}
          </a>
        </div>
        <div className={styles.heroStats}>
          {copy.stats.map((stat) => (
            <div key={stat.label} className={`lux-glass ${styles.statCard}`}>
              <span className={`${styles.statValue} lux-gold-text`}>{stat.value}</span>
              <span className={styles.statLabel}>{stat.label}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function useLandingLang(defaultLang: Lang = "en") {
  return useState<Lang>(defaultLang);
}

/** Shared luxury homepage shell for `/` (Pages Router) and `/luxury` (App Router preview). */
export function LuxuryHomePage() {
  const [lang, setLang] = useLandingLang("en");

  return (
    <div className="lux-page">
      <LuxuryNavbar langToggle={<LanguageToggle lang={lang} onChange={setLang} />} />
      <main>
        <HeroSection lang={lang} />
        <TestimonialsSection />
        <FaqSection />
      </main>
      <LuxuryFooter />
    </div>
  );
}
