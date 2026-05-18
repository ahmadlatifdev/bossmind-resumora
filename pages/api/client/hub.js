const { readEngagementActor } = require("../../../lib/engagement/http-context");
const { ensureEngagementSchema } = require("../../../lib/shared/neon-memory");
const { listEntitlementsForUser } = require("../../../lib/client/entitlements-store");
const { getDeliverableForPlan } = require("../../../lib/client/deliverables-catalog");

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const lang = String(req.query.lang || "en").toLowerCase() === "fr" ? "fr" : "en";

  try {
    await ensureEngagementSchema();
    const actor = await readEngagementActor(req, res);
    const rows = await listEntitlementsForUser(actor.profileId, actor.profileEmail);

    const plans = rows.map((row) => {
      const deliverable = getDeliverableForPlan(row.plan_id, lang);
      return {
        planId: row.plan_id,
        grantedAt: row.granted_at,
        displayName: deliverable?.displayName || row.plan_id,
        studioPath: deliverable?.studioPath || "/studio",
        welcomeDownloadUrl: deliverable?.welcomeAssetId
          ? `/api/client/download?assetId=${encodeURIComponent(deliverable.welcomeAssetId)}&planId=${encodeURIComponent(row.plan_id)}&lang=${lang}`
          : null,
        features: deliverable?.features || [],
      };
    });

    return res.status(200).json({
      ok: true,
      signedIn: Boolean(actor.profileId),
      email: actor.profileEmail || null,
      lang,
      plans,
      hasAccess: plans.length > 0,
    });
  } catch (e) {
    return res.status(500).json({ error: e.message || "Server error" });
  }
}
