const { readEngagementActor } = require("../../../lib/engagement/http-context");
const { ensureEngagementSchema } = require("../../../lib/shared/neon-memory");
const {
  hasEntitlement,
  PLAN_ESSENTIAL_ADVANCED,
} = require("../../../lib/client/entitlements-store");

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    await ensureEngagementSchema();
    const actor = await readEngagementActor(req, res);
    const access = await hasEntitlement(actor.profileId, actor.profileEmail, PLAN_ESSENTIAL_ADVANCED);

    return res.status(200).json({
      ok: true,
      planId: PLAN_ESSENTIAL_ADVANCED,
      entitled: access.entitled,
      source: access.source || null,
      grantedAt: access.grantedAt || null,
      signedIn: Boolean(actor.profileId),
      studioPath: "/studio/essential-advanced",
    });
  } catch (e) {
    return res.status(500).json({ error: e.message || "Server error" });
  }
}
