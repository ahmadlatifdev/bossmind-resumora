const { loadPublicEngagementBundle } = require("../../../lib/marketing/public-engagement-data");

/**
 * Public, cacheable engagement bundle for marketing UI (no auth).
 * Only aggregates + moderator-approved review snippets.
 */
export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const bundle = await loadPublicEngagementBundle();
    res.setHeader("Cache-Control", "public, s-maxage=180, stale-while-revalidate=300");
    return res.status(200).json(bundle);
  } catch (e) {
    return res.status(500).json({ error: e.message || "Server error" });
  }
}
