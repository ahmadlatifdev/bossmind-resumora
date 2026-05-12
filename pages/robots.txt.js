import { buildRobotsTxt } from "@/lib/marketing/seo-config";

export async function getServerSideProps({ res }) {
  const body = buildRobotsTxt();
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Cache-Control", "public, s-maxage=86400, stale-while-revalidate=604800");
  res.write(body);
  res.end();
  return { props: {} };
}

export default function RobotsTxt() {
  return null;
}
