import Head from "next/head";
import Link from "next/link";
import SiteChrome from "@/components/marketing/SiteChrome";
import { useLanguage } from "@/context/LanguageContext";
import { getSiteUrl } from "@/lib/marketing/seo-config";
import { solutionSlugs, solutionsCopy } from "@/lib/marketing/seo-data";
import { translations } from "@/lib/marketing/site-copy";

export default function ResourcesHubPage() {
  const { lang } = useLanguage();
  const t = translations[lang];
  const site = getSiteUrl();
  const canonical = `${site.replace(/\/$/, "")}/resources`;

  return (
    <SiteChrome>
      <Head>
        <title>{lang === "fr" ? "Ressources SEO & carrière | Resumora" : "Career & SEO resources | Resumora"}</title>
        <meta
          name="description"
          content={
            lang === "fr"
              ? "Index des pages thématiques Resumora — CV ATS, direction, bilingue, Canada, entretien, LinkedIn."
              : "Index of Resumora topic pages—ATS, executive, bilingual, Canada, interview, LinkedIn, and more."
          }
        />
        <link rel="canonical" href={canonical} />
        <meta
          name="robots"
          content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1"
        />
        <meta property="og:title" content={lang === "fr" ? "Ressources | Resumora" : "Resources | Resumora"} />
        <meta property="og:url" content={canonical} />
        <meta name="twitter:card" content="summary_large_image" />
      </Head>
      <main>
        <section className="rs-section">
          <div className="rs-container">
            <p className="rs-eyebrow">{t.navServices}</p>
            <h1 className="rs-page-title">{lang === "fr" ? "Ressources & pages thématiques" : "Resources & topic pages"}</h1>
            <p className="rs-lead">
              {lang === "fr"
                ? "Liens internes vers nos pages service — même interface approuvée, contenu orienté recherche."
                : "Internal links to our service landings—same approved chrome, search-oriented depth."}
            </p>
            <ul style={{ listStyle: "none", padding: 0, margin: "1.25rem 0 0", display: "grid", gap: "0.65rem" }}>
              {solutionSlugs.map((slug) => {
                const row = solutionsCopy[slug]?.[lang];
                if (!row) return null;
                return (
                  <li key={slug} style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", alignItems: "baseline" }}>
                    <Link href={`/solutions/${slug}`}>{row.h1}</Link>
                    <span style={{ fontSize: "0.75rem", color: "var(--rs-text-muted)" }}>{slug}</span>
                  </li>
                );
              })}
            </ul>
            <div className="rs-hero-ctas" style={{ marginTop: "1.5rem" }}>
              <Link href="/services" className="rs-btn-accent">
                {t.servicesPageTitle}
              </Link>
              <Link href="/pricing" className="rs-btn-ghost">
                {t.navPricing}
              </Link>
            </div>
          </div>
        </section>
      </main>
    </SiteChrome>
  );
}
