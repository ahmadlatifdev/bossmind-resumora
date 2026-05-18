const { readEngagementActor } = require("../../../lib/engagement/http-context");
const { ensureEngagementSchema } = require("../../../lib/shared/neon-memory");
const {
  hasEntitlement,
  upsertProgress,
  PLAN_ESSENTIAL_ADVANCED,
} = require("../../../lib/essential-advanced/entitlements-store");
const { allAssetKeys } = require("../../../lib/essential-advanced/interview-prep-content");

export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    await ensureEngagementSchema();
    const actor = await readEngagementActor(req, res);
    const access = await hasEntitlement(actor.profileId, actor.profileEmail, PLAN_ESSENTIAL_ADVANCED);

    if (!access.entitled || !actor.profileId) {
      return res.status(403).json({ ok: false, error: "not_entitled" });
    }

    if (req.method === "GET") {
      const { listProgress } = require("../../../lib/essential-advanced/entitlements-store");
      const rows = await listProgress(actor.profileId);
      return res.status(200).json({ ok: true, progress: rows });
    }

    const { assetKey, completed = true } = req.body || {};
    const allowed = new Set(allAssetKeys());
    if (!allowed.has(assetKey)) {
      return res.status(400).json({ error: "invalid_asset_key" });
    }

    const row = await upsertProgress(actor.profileId, assetKey, Boolean(completed));
    return res.status(200).json({ ok: true, progress: row });
  } catch (e) {
    return res.status(500).json({ error: e.message || "Server error" });
  }
}
