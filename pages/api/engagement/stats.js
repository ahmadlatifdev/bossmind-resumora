const { readEngagementActor } = require("../../../lib/engagement/http-context");
const {
  getAggregateStats,
  userEngagementState,
  listApprovedReviews,
} = require("../../../lib/engagement/store");
const { FOOTER_SITE_RESOURCE_KEY, SERVICE_RESOURCE_KEYS } = require("../../../lib/engagement/service-ids");

const STATE_KEYS = [...SERVICE_RESOURCE_KEYS, FOOTER_SITE_RESOURCE_KEY];

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    res.setHeader("Cache-Control", "private, max-age=0, s-maxage=0, must-revalidate");
    const actor = await readEngagementActor(req, res);
    const stats = await getAggregateStats();
    const engagement = await userEngagementState(actor.profileId, actor.visitorId, STATE_KEYS);
    const reviews = await listApprovedReviews(12);

    return res.status(200).json({
      ...stats,
      myLikes: Array.from(engagement.likes),
      myDislikes: Array.from(engagement.dislikes),
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
