/**
 * Server-side ingest for cross-platform social metrics (cron, Zapier, Make, n8n, etc.).
 * Stores normalized analytics in Neon shared memory without touching UI.
 */
const { saveEvent, upsertTaskState } = require("../../../lib/shared/neon-memory");
const SUPPORTED_PLATFORMS = new Set([
  "facebook",
  "instagram",
  "tiktok",
  "youtube",
  "linkedin",
  "pinterest",
  "x",
  "threads",
]);

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const secret = process.env.SOCIAL_INGEST_SECRET;
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";

  if (!secret || token !== secret) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const body = req.body && typeof req.body === "object" ? req.body : {};
  const platform = String(body.platform || "unknown")
    .trim()
    .toLowerCase()
    .slice(0, 64);
  if (!SUPPORTED_PLATFORMS.has(platform)) {
    return res.status(400).json({ error: "Unsupported platform" });
  }
  const metric = String(body.metric || body.eventType || "snapshot").slice(0, 128);
  const snapshotId = String(body.snapshotId || body.id || "").slice(0, 256);

  try {
    await saveEvent({
      projectKey: "resumora",
      eventType: "social_channel_metric",
      severity: "info",
      source: platform,
      eventKey: snapshotId || `${platform}:${metric}:${Date.now()}`,
      payload: {
        platform,
        metric,
        followers: body.followers,
        engagementRate: body.engagementRate,
        views: body.views,
        clicks: body.clicks,
        leads: body.leads,
        conversions: body.conversions,
        ctr: body.ctr,
        monetizationEligibility: body.monetizationEligibility,
        topHashtags: Array.isArray(body.topHashtags) ? body.topHashtags.slice(0, 25) : [],
        topContentRef: body.topContentRef || "",
        revenueCents: body.revenueCents,
        stripeReportRef: body.stripeReportRef,
        capturedAt: body.capturedAt || new Date().toISOString(),
        raw: body,
      },
    });
    await upsertTaskState({
      projectKey: "resumora",
      taskKey: `social:ingest:${platform}`,
      status: "completed",
      assignedAgent: "social-ingest",
      payload: {
        platform,
        capturedAt: body.capturedAt || new Date().toISOString(),
        metric,
      },
    });
    return res.status(204).end();
  } catch (e) {
    console.error("social-ingest:", e);
    return res.status(500).json({ error: "Ingest failed" });
  }
}
