import Head from "next/head";
import Link from "next/link";
import SiteChrome from "@/components/marketing/SiteChrome";
import { useLanguage } from "@/context/LanguageContext";
import { withBrandingQuery } from "@/lib/marketing/branding-assets";
import { getSiteUrl } from "@/lib/marketing/seo-config";
import { solutionSlugs, solutionsCopy } from "@/lib/marketing/seo-data";
import { translations } from "@/lib/marketing/site-copy";

export default function SolutionLandingPage({ siteUrl, slug }) {
  const { lang } = useLanguage();
  const t = translations[lang];
  const base = String(siteUrl || "https://resumora.net").replace(/\/$/, "");
  const key = typeof slug === "string" && solutionsCopy[slug] ? slug : "ats-resume";
  const copy = solutionsCopy[key][lang];
  const canonical = `${base}/solutions/${key}`;
  const ogImage = `${base}${withBrandingQuery("/og-resumora-brand.png")}`;
  const faqs = Array.isArray(copy.faqs) ? copy.faqs : [];
  const faqJsonLd =
    faqs.length > 0
      ? {
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: faqs.map((item) => ({
            "@type": "Question",
            name: item.q,
            acceptedAnswer: { "@type": "Answer", text: item.a },
          })),
        }
      : null;
  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: `${base}/` },
      { "@type": "ListItem", position: 2, name: t.navServices, item: `${base}/services` },
      { "@type": "ListItem", position: 3, name: copy.h1, item: canonical },
    ],
  };
  const related = solutionSlugs.filter((s) => s !== key).slice(0, 6);

  return (
    <SiteChrome>
      <Head>
        <title>{copy.title}</title>
        <meta name="description" content={copy.description} />
        <meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1" />
        <link rel="canonical" href={canonical} />
        <meta property="og:type" content="article" />
        <meta property="og:title" content={copy.title} />
        <meta property="og:description" content={copy.description} />
        <meta property="og:url" content={canonical} />
        <meta property="og:image" content={ogImage} />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={copy.title} />
        <meta name="twitter:description" content={copy.description} />
        <meta name="twitter:image" content={ogImage} />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "Service",
              name: copy.h1,
              description: copy.description,
              url: canonical,
              areaServed: ["Worldwide"],
              availableLanguage: ["English", "French"],
              provider: { "@type": "Organization", name: "Resumora", url: base },
            }),
          }}
        />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />
        {faqJsonLd ? (
          <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />
        ) : null}
      </Head>
      <main>
        <article className="rs-section">
          <div className="rs-container">
            <nav style={{ fontSize: "0.85rem", color: "var(--rs-text-muted)", marginBottom: "1rem" }} aria-label="Breadcrumb">
              <Link href="/">{t.navHome}</Link>
              <span aria-hidden> / </span>
              <Link href="/services">{t.navServices}</Link>
              <span aria-hidden> / </span>
              <span>{copy.h1}</span>
            </nav>
            <p className="rs-eyebrow">{t.seoSolutionsEyebrow}</p>
            <h1 className="rs-page-title">{copy.h1}</h1>
            <p className="rs-lead">{copy.lead}</p>
            <ul style={{ margin: "1.5rem 0 0", paddingLeft: "1.25rem", color: "var(--rs-text-secondary)", lineHeight: 1.75 }}>
              {(copy.body || []).map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
            {faqs.length ? (
              <section style={{ marginTop: "2rem" }} aria-labelledby="solution-faq-heading">
                <h2 id="solution-faq-heading" className="rs-h2" style={{ fontSize: "clamp(1.15rem, 2vw, 1.35rem)" }}>
                  {lang === "fr" ? "Questions fréquentes" : "Frequently asked questions"}
                </h2>
                <dl style={{ marginTop: "0.75rem" }}>
                  {faqs.map((item) => (
                    <div key={item.q} style={{ marginBottom: "1rem" }}>
                      <dt style={{ fontWeight: 600, color: "var(--rs-text-primary)", marginBottom: "0.25rem" }}>{item.q}</dt>
                      <dd style={{ margin: 0, color: "var(--rs-text-secondary)", lineHeight: 1.65 }}>{item.a}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            ) : null}
            {related.length ? (
              <section style={{ marginTop: "2rem" }} aria-labelledby="related-solutions-heading">
                <h2 id="related-solutions-heading" className="rs-h2" style={{ fontSize: "clamp(1.15rem, 2vw, 1.35rem)" }}>
                  {lang === "fr" ? "Pages associées" : "Related topic pages"}
                </h2>
                <ul style={{ margin: "0.75rem 0 0", paddingLeft: "1.25rem", lineHeight: 1.8 }}>
                  {related.map((s) => {
                    const label = solutionsCopy[s]?.[lang]?.h1 || s;
                    return (
                      <li key={s}>
                        <Link href={`/solutions/${s}`}>{label}</Link>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ) : null}
            <div className="rs-hero-ctas" style={{ marginTop: "1.75rem" }}>
              <Link href="/pricing" className="rs-btn-accent">
                {t.ctaPricingUrl}
              </Link>
              <Link href="/services#intake" className="rs-btn-ghost">
                {t.heroSecureUploadShort}
              </Link>
            </div>
          </div>
        </article>
      </main>
    </SiteChrome>
  );
}

export async function getStaticPaths() {
  return {
    paths: solutionSlugs.map((s) => ({ params: { slug: s } })),
    fallback: false,
  };
}

export async function getStaticProps({ params }) {
  return {
    props: {
      siteUrl: getSiteUrl(),
      slug: params.slug,
    },
  };
}
