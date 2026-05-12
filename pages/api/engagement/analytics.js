const { readEngagementActor } = require("../../../lib/engagement/http-context");
const { getAggregateStats } = require("../../../lib/engagement/store");
const { getSqlClient, ensureSharedMemoryInitialized } = require("../../../lib/shared/neon-memory");

function authorized(req, actor) {
  const secret = process.env.BOSSMIND_ORCHESTRATION_SECRET;
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  return Boolean((secret && token === secret) || actor?.profileId);
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const actor = await readEngagementActor(req, res);
  if (!authorized(req, actor)) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  await ensureSharedMemoryInitialized();
  const stats = await getAggregateStats();
  const sql = getSqlClient();
  let socialPerf = [];
  if (sql) {
    socialPerf = await sql(
      `SELECT source AS platform,
              COUNT(*)::int AS events,
              AVG(COALESCE((payload->>'engagementRate')::numeric, 0))::numeric(10,4) AS avg_engagement,
              SUM(COALESCE((payload->>'clicks')::int, 0))::int AS clicks,
              SUM(COALESCE((payload->>'conversions')::int, 0))::int AS conversions
       FROM event_log
       WHERE project_key = $1
         AND event_type = 'social_channel_metric'
       GROUP BY source
       ORDER BY clicks DESC`,
      ["resumora"]
    );
  }

  const conversionSummary = stats.conversionScoring?.slice(0, 6).map((row) => ({
    ...row,
    tier: row.heat >= 80 ? "hot" : row.heat >= 45 ? "warm" : "cold",
  }));

  return res.status(200).json({
    ok: true,
    enabled: stats.enabled,
    followers: stats.followers,
    registrations: stats.registrations,
    sharesTotal: stats.sharesTotal,
    socialClicksByPlatform: stats.socialClicksByPlatform,
    mostLiked: stats.likesByResource?.slice(0, 10) || [],
    mostSaved: stats.savesByResource?.slice(0, 10) || [],
    mostRequested: stats.requestsByResource?.slice(0, 10) || [],
    trendingServices: stats.trendingServices || [],
    conversionSummary: conversionSummary || [],
    socialPerformance: socialPerf || [],
    regional: stats.regional || [],
  });
}
