const { readEngagementActor } = require("../../../lib/engagement/http-context");
const { ensureEngagementSchema } = require("../../../lib/shared/neon-memory");
const {
  hasEntitlement,
  PLAN_ESSENTIAL_ADVANCED,
} = require("../../../lib/essential-advanced/entitlements-store");
const {
  DOWNLOADS,
  renderDownload,
} = require("../../../lib/essential-advanced/interview-prep-content");

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const assetId = String(req.query.assetId || "").trim();
  const lang = String(req.query.lang || "en").toLowerCase() === "fr" ? "fr" : "en";
  const meta = DOWNLOADS.find((d) => d.id === assetId);

  if (!meta) {
    return res.status(404).json({ error: "asset_not_found" });
  }

  try {
    await ensureEngagementSchema();
    const actor = await readEngagementActor(req, res);
    const access = await hasEntitlement(actor.profileId, actor.profileEmail, PLAN_ESSENTIAL_ADVANCED);

    if (!access.entitled) {
      return res.status(403).json({ error: "not_entitled" });
    }

    const body = renderDownload(assetId, lang);
    if (!body) {
      return res.status(404).json({ error: "asset_unavailable" });
    }

    res.setHeader("Content-Type", meta.mime);
    res.setHeader("Content-Disposition", `attachment; filename="${meta.filename}"`);
    res.setHeader("Cache-Control", "private, no-store");
    return res.status(200).send(body);
  } catch (e) {
    return res.status(500).json({ error: e.message || "Server error" });
  }
}
