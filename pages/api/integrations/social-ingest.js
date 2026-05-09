/**
 * Server-side ingest for external YouTube/TikTok engagement metrics (cron, Zapier, etc.).
 * Does not surface video on the public site — pairs with neon event_log + analytics.
 */
const { saveEvent } = require("../../../lib/shared/neon-memory");

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
  const platform = String(body.platform || "unknown").slice(0, 64);
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
        revenueCents: body.revenueCents,
        stripeReportRef: body.stripeReportRef,
        capturedAt: body.capturedAt || new Date().toISOString(),
        raw: body,
      },
    });
    return res.status(204).end();
  } catch (e) {
    console.error("social-ingest:", e);
    return res.status(500).json({ error: "Ingest failed" });
  }
}
