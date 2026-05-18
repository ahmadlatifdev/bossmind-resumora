require("../../../lib/shared/ensure-project-env");
const { readEngagementActor } = require("../../../lib/engagement/http-context");
const { ensureEngagementSchema, saveEvent } = require("../../../lib/shared/neon-memory");
const {
  hasEntitlement,
  PLAN_ESSENTIAL_ADVANCED,
} = require("../../../lib/client/entitlements-store");

const ALLOWED_EVENTS = new Set([
  "video_load_start",
  "video_load_ok",
  "video_load_error",
  "video_fallback",
  "video_playback_ready",
]);

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    await ensureEngagementSchema();
    const actor = await readEngagementActor(req, res);
    const access = await hasEntitlement(actor.profileId, actor.profileEmail, PLAN_ESSENTIAL_ADVANCED);

    if (!access.entitled || !actor.profileId) {
      return res.status(403).json({ ok: false, error: "forbidden" });
    }

    const body = req.body || {};
    const event = String(body.event || "").trim();
    const videoId = String(body.videoId || "").trim();
    const lang = String(body.lang || "en").toLowerCase() === "fr" ? "fr" : "en";

    if (!ALLOWED_EVENTS.has(event) || !videoId) {
      return res.status(400).json({ ok: false, error: "invalid_payload" });
    }

    const projectKey = process.env.BOSSMIND_PROJECT_KEY || "resumora";
    await saveEvent({
      projectKey,
      eventType: `essential_advanced.video.${event}`,
      severity: event.includes("error") ? "warn" : "info",
      source: "essential-advanced-studio",
      payload: {
        videoId,
        lang,
        profileId: actor.profileId,
        detail: String(body.detail || "").slice(0, 200),
      },
    }).catch(() => {});

    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message || "Server error" });
  }
}
