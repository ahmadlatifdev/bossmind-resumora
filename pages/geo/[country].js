import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import SiteChrome from "@/components/marketing/SiteChrome";
import { useLanguage } from "@/context/LanguageContext";
import { geoCopy, geoSlugs } from "@/lib/marketing/seo-data";

export default function GeoLandingPage() {
  const router = useRouter();
  const { country } = router.query;
  const { lang } = useLanguage();
  const key = typeof country === "string" && geoCopy[country] ? country : "canada";
  const copy = geoCopy[key][lang];
  const canonical = `https://resumora.net/geo/${key}`;

  return (
    <SiteChrome>
      <Head>
        <title>{copy.title}</title>
        <meta name="description" content={copy.description} />
        <link rel="canonical" href={canonical} />
        <meta property="og:title" content={copy.title} />
        <meta property="og:description" content={copy.description} />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "WebPage",
              name: copy.h1,
              description: copy.description,
              url: canonical,
            }),
          }}
        />
      </Head>
      <main>
        <article className="rs-section">
          <div className="rs-container">
            <p className="rs-eyebrow">SEO · {key.toUpperCase()}</p>
            <h1 className="rs-page-title">{copy.h1}</h1>
            <p className="rs-lead">{copy.lead}</p>
            <ul style={{ margin: "1.5rem 0 0", paddingLeft: "1.25rem", color: "var(--rs-text-secondary)", lineHeight: 1.75 }}>
              {(copy.body || []).map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
            <div className="rs-hero-ctas" style={{ marginTop: "1.75rem" }}>
              <Link href="/global-reach" className="rs-btn-accent">
                {lang === "en" ? "Global reach" : "Portée mondiale"}
              </Link>
              <Link href="/pricing" className="rs-btn-ghost">
                resumora.net/pricing
              </Link>
            </div>
          </div>
        </article>
      </main>
    </SiteChrome>
  );
}

export async function getStaticPaths() {
  return { paths: geoSlugs.map((country) => ({ params: { country } })), fallback: false };
}

export async function getStaticProps() {
  return { props: {} };
}
