/**
 * Policy-safe public bundle for marketing engagement surfaces.
 * Aggregates only — no PII, no per-user rows exposed to anonymous clients.
 */

const { ensureSharedMemoryInitialized, getSqlClient } = require("../shared/neon-memory");
const { getAggregateStats, listApprovedReviews } = require("../engagement/store");

async function safeCount(sql, query, fallback = 0) {
  if (!sql) return fallback;
  try {
    const rows = await sql(query);
    return Number(rows?.[0]?.c ?? rows?.[0]?.count ?? fallback) || fallback;
  } catch {
    return fallback;
  }
}

/** @returns {Promise<{ stats: object, reviews: object[], rollups: object, fetchedAt: string }>} */
async function loadPublicEngagementBundle() {
  await ensureSharedMemoryInitialized();
  const stats = await getAggregateStats();
  const rawReviews = await listApprovedReviews(24);
  const reviews = (rawReviews || []).map((r) => ({
    id: r.id,
    quote: String(r.quote || "").trim(),
    author_display: String(r.author_display || "").trim(),
    role_display: String(r.role_display || "").trim(),
  }));

  const sql = getSqlClient();
  /* Public bundle: positive-only — never expose dislike rollups to anonymous clients. */
  const { dislikesByResource: _omitDislikes, ...publicStats } = stats || {};
  const webViews7d = await safeCount(
    sql,
    `SELECT COUNT(*)::int AS c FROM analytics_web_events WHERE created_at > NOW() - INTERVAL '7 days'`
  );
  const engagementEvents7d = await safeCount(
    sql,
    `SELECT COUNT(*)::int AS c FROM engagement_activity WHERE created_at > NOW() - INTERVAL '7 days'`
  );

  return {
    stats: publicStats,
    reviews,
    rollups: { webViews7d, engagementEvents7d },
    fetchedAt: new Date().toISOString(),
  };
}

module.exports = { loadPublicEngagementBundle };
