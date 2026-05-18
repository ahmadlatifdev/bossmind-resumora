require("../../../lib/shared/ensure-project-env");
const { readEngagementActor } = require("../../../lib/engagement/http-context");
const { ensureEngagementSchema } = require("../../../lib/shared/neon-memory");
const {
  hasEntitlement,
  PLAN_ESSENTIAL_ADVANCED,
} = require("../../../lib/client/entitlements-store");
const {
  resolveProtectedVideoDelivery,
  getVideoModule,
} = require("../../../lib/essential-advanced/video-delivery");

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const videoId = String(req.query.videoId || "").trim();
  const lang = String(req.query.lang || "en").toLowerCase() === "fr" ? "fr" : "en";

  if (!videoId || !getVideoModule(videoId)) {
    return res.status(400).json({ ok: false, error: "invalid_video_id" });
  }

  try {
    await ensureEngagementSchema();
    const actor = await readEngagementActor(req, res);
    const access = await hasEntitlement(actor.profileId, actor.profileEmail, PLAN_ESSENTIAL_ADVANCED);

    if (!access.entitled) {
      return res.status(403).json({
        ok: false,
        error: "not_entitled",
        hint: "Essential Advanced plan required for premium interview videos.",
      });
    }

    if (!actor.profileId) {
      return res.status(401).json({ ok: false, error: "sign_in_required" });
    }

    const delivery = resolveProtectedVideoDelivery(videoId, lang);
    if (!delivery) {
      return res.status(404).json({ ok: false, error: "video_not_found" });
    }

    res.setHeader("Cache-Control", "private, no-store");
    return res.status(200).json(delivery);
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message || "Server error" });
  }
}
