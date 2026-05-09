const { readEngagementActor } = require("../../../lib/engagement/http-context");
const {
  getAggregateStats,
  userEngagementState,
  listApprovedReviews,
} = require("../../../lib/engagement/store");
const { SERVICE_RESOURCE_KEYS } = require("../../../lib/engagement/service-ids");

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const actor = await readEngagementActor(req, res);
    const stats = await getAggregateStats();
    const engagement = await userEngagementState(actor.profileId, actor.visitorId, SERVICE_RESOURCE_KEYS);
    const reviews = await listApprovedReviews(12);

    return res.status(200).json({
      ...stats,
      myLikes: Array.from(engagement.likes),
      mySaves: Array.from(engagement.saves),
      followingBrand: engagement.following,
      signedIn: Boolean(actor.profileId),
      email: actor.profileEmail || null,
      displayName: actor.profileName || null,
      reviews,
    });
  } catch (e) {
    return res.status(500).json({ error: e.message || "Server error" });
  }
}
