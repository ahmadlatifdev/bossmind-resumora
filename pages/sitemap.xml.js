import { buildSitemapXml } from "@/lib/marketing/seo-config";

/**
 * Dynamic XML sitemap — marketing routes + solution SSG pages.
 * Submit URL in Search Console: https://resumora.net/sitemap.xml
 */
export async function getServerSideProps({ res }) {
  const xml = buildSitemapXml();
  res.setHeader("Content-Type", "text/xml; charset=utf-8");
  res.setHeader("Cache-Control", "public, s-maxage=3600, stale-while-revalidate=86400");
  res.write(xml);
  res.end();
  return { props: {} };
}

export default function SitemapXml() {
  return null;
}
