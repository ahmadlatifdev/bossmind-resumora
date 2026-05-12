const { readEngagementActor } = require("../../../lib/engagement/http-context");
const {
  toggleLike,
  toggleDislike,
  toggleSave,
  recordRequest,
  recordShare,
  recordSocialClick,
  toggleFollowBrand,
} = require("../../../lib/engagement/store");
const { getSqlClient, ensureSharedMemoryInitialized } = require("../../../lib/shared/neon-memory");
const { checkRateLimit } = require("../../../lib/engagement/rate-limit");

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { type, resourceKey, regionHint } = req.body || {};
  if (!type) {
    return res.status(400).json({ error: "Missing type" });
  }

  try {
    const init = await ensureSharedMemoryInitialized();
    if (!init.enabled || !getSqlClient()) {
      return res.status(503).json({ error: "Engagement store unavailable (set NEON_DATABASE_URL)" });
    }

    const actor = await readEngagementActor(req, res);
    const profileId = actor.profileId;
    const visitorId = actor.visitorId;
    if (!profileId && !visitorId) {
      return res.status(400).json({ error: "No actor context" });
    }
    const limiter = checkRateLimit({
      scope: profileId ? `p:${profileId}` : `v:${visitorId}`,
      limit: 30,
      windowMs: 60_000,
    });
    if (!limiter.ok) {
      res.setHeader("Retry-After", String(Math.ceil(limiter.retryAfterMs / 1000)));
      return res.status(429).json({ error: "Rate limit exceeded. Try again shortly." });
    }

    if (type === "like" || type === "unlike") {
      if (!resourceKey) return res.status(400).json({ error: "Missing resourceKey" });
      const r = await toggleLike(profileId, visitorId, resourceKey, regionHint);
      return res.status(200).json(r);
    }
    if (type === "dislike" || type === "undislike") {
      if (!resourceKey) return res.status(400).json({ error: "Missing resourceKey" });
      const r = await toggleDislike(profileId, visitorId, resourceKey, regionHint);
      return res.status(200).json(r);
    }
    if (type === "share") {
      const r = await recordShare(profileId, visitorId, resourceKey, regionHint);
      return res.status(200).json(r);
    }
    if (type === "social_click") {
      const r = await recordSocialClick(
        profileId,
        visitorId,
        req.body?.platform,
        req.body?.href,
        regionHint,
        req.body?.source
      );
      return res.status(200).json(r);
    }
    if (type === "save" || type === "unsave") {
      if (!resourceKey) return res.status(400).json({ error: "Missing resourceKey" });
      const r = await toggleSave(profileId, visitorId, resourceKey, regionHint);
      return res.status(200).json(r);
    }
    if (type === "request") {
      if (!resourceKey) return res.status(400).json({ error: "Missing resourceKey" });
      const r = await recordRequest(profileId, visitorId, resourceKey, regionHint);
      return res.status(200).json(r);
    }
    if (type === "configure") {
      if (!resourceKey) return res.status(400).json({ error: "Missing resourceKey" });
      const r = await recordRequest(profileId, visitorId, resourceKey, regionHint);
      return res.status(200).json({ ok: true, configureLogged: true, requestRecorded: r.ok });
    }
    if (type === "follow" || type === "unfollow") {
      const r = await toggleFollowBrand(profileId, visitorId, regionHint);
      return res.status(200).json(r);
    }

    return res.status(400).json({ error: "Unknown type" });
  } catch (e) {
    return res.status(500).json({ error: e.message || "Server error" });
  }
}
