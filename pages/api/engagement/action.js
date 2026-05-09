const { readEngagementActor } = require("../../../lib/engagement/http-context");
const {
  toggleLike,
  toggleSave,
  recordRequest,
  toggleFollowBrand,
} = require("../../../lib/engagement/store");
const { getSqlClient } = require("../../../lib/shared/neon-memory");

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!getSqlClient()) {
    return res.status(503).json({ error: "Engagement store unavailable (set NEON_DATABASE_URL)" });
  }

  const { type, resourceKey, regionHint } = req.body || {};
  if (!type) {
    return res.status(400).json({ error: "Missing type" });
  }

  try {
    const actor = await readEngagementActor(req, res);
    const profileId = actor.profileId;
    const visitorId = actor.visitorId;
    if (!profileId && !visitorId) {
      return res.status(400).json({ error: "No actor context" });
    }

    if (type === "like" || type === "unlike") {
      if (!resourceKey) return res.status(400).json({ error: "Missing resourceKey" });
      const r = await toggleLike(profileId, visitorId, resourceKey, regionHint);
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
    if (type === "follow" || type === "unfollow") {
      const r = await toggleFollowBrand(profileId, visitorId, regionHint);
      return res.status(200).json(r);
    }

    return res.status(400).json({ error: "Unknown type" });
  } catch (e) {
    return res.status(500).json({ error: e.message || "Server error" });
  }
}
