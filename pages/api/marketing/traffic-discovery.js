const { buildTrafficDiscoveryHints } = require("../../../lib/marketing/traffic-discovery-hints");

/**
 * Public discovery inventory + honest external-confirmation gaps (GET, cacheable).
 */
export default function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const hints = buildTrafficDiscoveryHints();
    res.setHeader("Cache-Control", "public, s-maxage=300, stale-while-revalidate=600");
    return res.status(200).json(hints);
  } catch (e) {
    return res.status(500).json({ error: e.message || "Server error" });
  }
}
