const { readEngagementActor } = require("../../../lib/engagement/http-context");
const { ensureEngagementSchema } = require("../../../lib/shared/neon-memory");
const {
  hasEntitlement,
  listProgress,
  PLAN_ESSENTIAL_ADVANCED,
} = require("../../../lib/essential-advanced/entitlements-store");
const { getInterviewPrepCatalog } = require("../../../lib/essential-advanced/interview-prep-content");

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const lang = String(req.query.lang || "en").toLowerCase() === "fr" ? "fr" : "en";

  try {
    await ensureEngagementSchema();
    const actor = await readEngagementActor(req, res);
    const access = await hasEntitlement(actor.profileId, actor.profileEmail, PLAN_ESSENTIAL_ADVANCED);

    if (!access.entitled) {
      return res.status(403).json({
        ok: false,
        error: "not_entitled",
        hint: "Purchase Essential Advanced to unlock interview preparation materials.",
      });
    }

    if (!actor.profileId) {
      return res.status(401).json({
        ok: false,
        error: "sign_in_required",
        hint: "Create an account or sign in to access your studio.",
      });
    }

    const progress = await listProgress(actor.profileId);
    const completed = new Set(progress.filter((p) => p.completed).map((p) => p.asset_key));

    return res.status(200).json({
      ok: true,
      lang,
      catalog: getInterviewPrepCatalog(lang),
      progress: progress.map((p) => ({
        assetKey: p.asset_key,
        completed: p.completed,
        updatedAt: p.updated_at,
      })),
      completedCount: completed.size,
      totalAssets: getInterviewPrepCatalog(lang).assetKeys.length,
    });
  } catch (e) {
    return res.status(500).json({ error: e.message || "Server error" });
  }
}
