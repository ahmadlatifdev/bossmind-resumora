const fs = require("fs");
const path = require("path");
const { loadPublicEngagementBundle } = require("../../../lib/marketing/public-engagement-data");
const { buildTrafficDiscoveryHints } = require("../../../lib/marketing/traffic-discovery-hints");

function authorize(req) {
  const dev = process.env.NODE_ENV === "development";
  const diag = process.env.BOSSMIND_DIAGNOSTICS === "1";
  const secret = process.env.BOSSMIND_ORCHESTRATION_SECRET;
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  return dev || diag || (Boolean(secret) && token === secret);
}

function readOptimizationLatest() {
  const p = path.join(process.cwd(), ".bossmind", "optimization", "latest.json");
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return null;
  }
}

/**
 * Operator read-only trust + engagement + discovery snapshot (no PII, no public dislike promotion).
 * Auth: development, BOSSMIND_DIAGNOSTICS=1, or Bearer BOSSMIND_ORCHESTRATION_SECRET (same as runtime-sync-status).
 */
export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (!authorize(req)) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const bundle = await loadPublicEngagementBundle();
    const s = bundle.stats || {};
    const engagement = {
      enabled: Boolean(s.enabled),
      followers: s.followers ?? 0,
      registrations: s.registrations ?? 0,
      sharesTotal: s.sharesTotal ?? 0,
      rollups: bundle.rollups,
      trendingTop: (s.trendingServices || []).slice(0, 8),
      likesTop: (s.likesByResource || []).slice(0, 8).map((r) => ({ key: r.key, count: r.count })),
      savesTop: (s.savesByResource || []).slice(0, 8).map((r) => ({ key: r.key, count: r.count })),
      requestsTop: (s.requestsByResource || []).slice(0, 6).map((r) => ({ key: r.key, count: r.count })),
    };

    const opt = readOptimizationLatest();
    const optimization = opt
      ? {
          optimizationReadinessScore: opt.optimizationReadinessScore,
          recommendationCount: Array.isArray(opt.recommendations) ? opt.recommendations.length : 0,
          recommendations: (opt.recommendations || []).slice(0, 6),
          predictiveRiskScore: opt.predictiveRiskSnapshot?.riskScore ?? null,
        }
      : null;

    res.setHeader("Cache-Control", "private, no-store, max-age=0");
    return res.status(200).json({
      ts: new Date().toISOString(),
      engagement,
      reviewsApprovedCount: Array.isArray(bundle.reviews) ? bundle.reviews.length : 0,
      discovery: buildTrafficDiscoveryHints(),
      optimization,
      publicBundleFetchedAt: bundle.fetchedAt,
    });
  } catch (e) {
    return res.status(500).json({ error: e.message || "Server error" });
  }
}
