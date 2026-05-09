import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import SiteChrome from "@/components/marketing/SiteChrome";
import { useLanguage } from "@/context/LanguageContext";
import { solutionSlugs, solutionsCopy } from "@/lib/marketing/seo-data";
import { translations } from "@/lib/marketing/site-copy";

export default function SolutionLandingPage() {
  const router = useRouter();
  const { slug } = router.query;
  const { lang } = useLanguage();
  const t = translations[lang];
  const key = typeof slug === "string" && solutionsCopy[slug] ? slug : "ats-resume";
  const copy = solutionsCopy[key][lang];
  const canonical = `https://resumora.net/solutions/${key}`;

  return (
    <SiteChrome>
      <Head>
        <title>{copy.title}</title>
        <meta name="description" content={copy.description} />
        <link rel="canonical" href={canonical} />
        <meta property="og:title" content={copy.title} />
        <meta property="og:description" content={copy.description} />
        <meta property="og:url" content={canonical} />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "Service",
              name: copy.h1,
              description: copy.description,
              url: canonical,
              provider: { "@type": "Organization", name: "Resumora", url: "https://resumora.net" },
            }),
          }}
        />
      </Head>
      <main>
        <article className="rs-section">
          <div className="rs-container">
            <p className="rs-eyebrow">{t.seoSolutionsEyebrow}</p>
            <h1 className="rs-page-title">{copy.h1}</h1>
            <p className="rs-lead">{copy.lead}</p>
            <ul style={{ margin: "1.5rem 0 0", paddingLeft: "1.25rem", color: "var(--rs-text-secondary)", lineHeight: 1.75 }}>
              {(copy.body || []).map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
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
    paths: solutionSlugs.map((slug) => ({ params: { slug } })),
    fallback: false,
  };
}

export async function getStaticProps() {
  return { props: {} };
}
