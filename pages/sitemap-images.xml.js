import { buildImageSitemapXml } from "@/lib/marketing/seo-config";

/**
 * Image sitemap — brand assets on the homepage (Google Image Discovery).
 * Referenced from robots.txt. Submit in Search Console if needed.
 */
export async function getServerSideProps({ res }) {
  const xml = buildImageSitemapXml();
  res.setHeader("Content-Type", "text/xml; charset=utf-8");
  res.setHeader("Cache-Control", "public, s-maxage=86400, stale-while-revalidate=604800");
  res.write(xml);
  res.end();
  return { props: {} };
}

export default function SitemapImagesXml() {
  return null;
}
