const crypto = require("crypto");
const { getSqlClient, saveEvent } = require("../shared/neon-memory");
const { hashPassword, verifyPassword } = require("./password");

function digestToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

async function ensureVisitor(visitorId) {
  const sql = getSqlClient();
  if (!sql) return null;
  if (visitorId) {
    try {
      const rows = await sql(`SELECT id FROM engagement_visitors WHERE id = $1::uuid`, [visitorId]);
      if (rows.length) return visitorId;
    } catch {
      /* invalid uuid */
    }
  }
  const inserted = await sql(`INSERT INTO engagement_visitors DEFAULT VALUES RETURNING id`);
  return inserted[0].id;
}

async function registerProfile({ email, password, displayName }) {
  const sql = getSqlClient();
  if (!sql) return { ok: false, error: "database_unavailable" };
  const { salt, hash } = hashPassword(password);
  try {
    const rows = await sql(
      `INSERT INTO engagement_profiles (email, password_hash, password_salt, display_name)
       VALUES (LOWER(TRIM($1)), $2, $3, $4)
       RETURNING id, email, display_name, created_at`,
      [email, hash, salt, displayName || ""]
    );
    return { ok: true, profile: rows[0] };
  } catch (e) {
    if (String(e.message || "").includes("duplicate") || String(e.code) === "23505") {
      return { ok: false, error: "email_in_use" };
    }
    throw e;
  }
}

async function loginProfile(email, password) {
  const sql = getSqlClient();
  if (!sql) return { ok: false, error: "database_unavailable" };
  const rows = await sql(`SELECT id, email, password_hash, password_salt, display_name FROM engagement_profiles WHERE email = LOWER(TRIM($1))`, [
    email,
  ]);
  if (!rows.length || !verifyPassword(password, rows[0].password_salt, rows[0].password_hash)) {
    return { ok: false, error: "invalid_credentials" };
  }
  return { ok: true, profile: rows[0] };
}

async function createSession(profileId, ttlDays = 14) {
  const sql = getSqlClient();
  if (!sql) return null;
  const token = crypto.randomBytes(32).toString("hex");
  const tokenHash = digestToken(token);
  const expires = new Date(Date.now() + ttlDays * 864e5);
  await sql(`INSERT INTO engagement_sessions (profile_id, token_hash, expires_at) VALUES ($1, $2, $3)`, [
    profileId,
    tokenHash,
    expires.toISOString(),
  ]);
  return { token, expires };
}

async function resolveSession(token) {
  const sql = getSqlClient();
  if (!sql || !token) return null;
  const tokenHash = digestToken(token);
  const rows = await sql(
    `SELECT s.id AS session_id, s.profile_id, s.expires_at, p.email, p.display_name
     FROM engagement_sessions s
     JOIN engagement_profiles p ON p.id = s.profile_id
     WHERE s.token_hash = $1 AND s.expires_at > NOW()`,
    [tokenHash]
  );
  return rows[0] || null;
}

async function destroySession(token) {
  const sql = getSqlClient();
  if (!sql || !token) return;
  const tokenHash = digestToken(token);
  await sql(`DELETE FROM engagement_sessions WHERE token_hash = $1`, [tokenHash]);
}

async function logActivity({ profileId, visitorId, resourceKey, action, regionHint }) {
  const sql = getSqlClient();
  if (!sql) return;
  await sql(
    `INSERT INTO engagement_activity (profile_id, visitor_id, resource_key, action, region_hint)
     VALUES ($1, $2, $3, $4, $5)`,
    [profileId || null, visitorId || null, resourceKey || null, action, regionHint || null]
  );
  try {
    await saveEvent({
      projectKey: "resumora",
      eventType: `engagement_${action}`,
      severity: "info",
      source: "engagement",
      eventKey: resourceKey || "",
      payload: { regionHint: regionHint || "", profileId: profileId || "", visitorId: visitorId || "" },
    });
  } catch {
    /* optional analytics */
  }
}

const LIKE_SAVE_TABLES = {
  likes: "engagement_likes",
  saves: "engagement_saves",
  dislikes: "engagement_dislikes",
};

async function toggleTableRow({ kind, profileId, visitorId, resourceKey, regionHint, actionName }) {
  const table = LIKE_SAVE_TABLES[kind];
  if (!table) return { ok: false, error: "invalid_kind", active: false };
  const sql = getSqlClient();
  if (!sql) return { ok: false, error: "database_unavailable", active: false };
  const actorCol = profileId ? "profile_id" : "visitor_id";
  const actorVal = profileId || visitorId;
  const existing = await sql(
    `SELECT id FROM ${table} WHERE resource_key = $1 AND ${actorCol} = $2`,
    [resourceKey, actorVal]
  );
  if (existing.length) {
    await sql(`DELETE FROM ${table} WHERE id = $1`, [existing[0].id]);
    await logActivity({
      profileId,
      visitorId,
      resourceKey,
      action: `${actionName}_remove`,
      regionHint,
    });
    return { ok: true, active: false };
  }
  await sql(`INSERT INTO ${table} (resource_key, ${actorCol}) VALUES ($1, $2)`, [resourceKey, actorVal]);
  await logActivity({ profileId, visitorId, resourceKey, action: `${actionName}_add`, regionHint });
  return { ok: true, active: true };
}

async function removeSilentRow(kind, profileId, visitorId, resourceKey) {
  const table = LIKE_SAVE_TABLES[kind];
  if (!table) return;
  const sql = getSqlClient();
  if (!sql) return;
  const actorCol = profileId ? "profile_id" : "visitor_id";
  const actorVal = profileId || visitorId;
  await sql(`DELETE FROM ${table} WHERE resource_key = $1 AND ${actorCol} = $2`, [resourceKey, actorVal]);
}

async function toggleLike(profileId, visitorId, resourceKey, regionHint) {
  const r = await toggleTableRow({
    kind: "likes",
    profileId,
    visitorId,
    resourceKey,
    regionHint,
    actionName: "like",
  });
  if (r.active) {
    await removeSilentRow("dislikes", profileId, visitorId, resourceKey);
  }
  return r;
}

async function toggleDislike(profileId, visitorId, resourceKey, regionHint) {
  const r = await toggleTableRow({
    kind: "dislikes",
    profileId,
    visitorId,
    resourceKey,
    regionHint,
    actionName: "dislike",
  });
  if (r.active) {
    await removeSilentRow("likes", profileId, visitorId, resourceKey);
  }
  return r;
}

async function toggleSave(profileId, visitorId, resourceKey, regionHint) {
  return toggleTableRow({
    kind: "saves",
    profileId,
    visitorId,
    resourceKey,
    regionHint,
    actionName: "save",
  });
}

async function recordRequest(profileId, visitorId, resourceKey, regionHint) {
  const sql = getSqlClient();
  if (!sql) return { ok: false, error: "database_unavailable" };
  const actorCol = profileId ? "profile_id" : "visitor_id";
  const actorVal = profileId || visitorId;
  const existing = await sql(
    `SELECT id FROM engagement_requests WHERE resource_key = $1 AND ${actorCol} = $2`,
    [resourceKey, actorVal]
  );
  if (existing.length) {
    return { ok: true, alreadyRecorded: true };
  }
  await sql(`INSERT INTO engagement_requests (resource_key, ${actorCol}) VALUES ($1, $2)`, [resourceKey, actorVal]);
  await logActivity({ profileId, visitorId, resourceKey, action: "request", regionHint });
  return { ok: true, alreadyRecorded: false };
}

async function recordShare(profileId, visitorId, resourceKey, regionHint) {
  await logActivity({
    profileId,
    visitorId,
    resourceKey: resourceKey || "resumora_site",
    action: "share",
    regionHint,
  });
  return { ok: true };
}

async function toggleFollowBrand(profileId, visitorId, regionHint) {
  const sql = getSqlClient();
  if (!sql) return { ok: false, error: "database_unavailable", active: false };
  const target = "resumora";
  const actorCol = profileId ? "profile_id" : "visitor_id";
  const actorVal = profileId || visitorId;
  const existing = await sql(
    `SELECT id FROM engagement_follows WHERE target = $1 AND ${actorCol} = $2`,
    [target, actorVal]
  );
  if (existing.length) {
    await sql(`DELETE FROM engagement_follows WHERE id = $1`, [existing[0].id]);
    await logActivity({ profileId, visitorId, resourceKey: target, action: "unfollow", regionHint });
    return { ok: true, active: false };
  }
  if (profileId) {
    await sql(`INSERT INTO engagement_follows (profile_id, target) VALUES ($1, $2)`, [profileId, target]);
  } else {
    await sql(`INSERT INTO engagement_follows (visitor_id, target) VALUES ($1, $2)`, [visitorId, target]);
  }
  await logActivity({ profileId, visitorId, resourceKey: target, action: "follow", regionHint });
  return { ok: true, active: true };
}

async function getAggregateStats() {
  const sql = getSqlClient();
  if (!sql) {
    return {
      enabled: false,
      followers: 0,
      likesByResource: [],
      savesByResource: [],
      requestsByResource: [],
      registrations: 0,
      regional: [],
    };
  }

  const followers = await sql(`SELECT COUNT(*)::int AS c FROM engagement_follows`);
  const registrations = await sql(`SELECT COUNT(*)::int AS c FROM engagement_profiles`);
  const likesByResource = await sql(
    `SELECT resource_key AS key, COUNT(*)::int AS count FROM engagement_likes GROUP BY resource_key ORDER BY count DESC`
  );
  const savesByResource = await sql(
    `SELECT resource_key AS key, COUNT(*)::int AS count FROM engagement_saves GROUP BY resource_key ORDER BY count DESC`
  );
  const requestsByResource = await sql(
    `SELECT resource_key AS key, COUNT(*)::int AS count FROM engagement_requests GROUP BY resource_key ORDER BY count DESC`
  );
  const regional = await sql(
    `SELECT COALESCE(region_hint, 'unknown') AS region, COUNT(*)::int AS count
     FROM engagement_activity
     WHERE region_hint IS NOT NULL AND region_hint <> ''
     GROUP BY region_hint
     ORDER BY count DESC
     LIMIT 12`
  );

  return {
    enabled: true,
    followers: followers[0]?.c ?? 0,
    registrations: registrations[0]?.c ?? 0,
    likesByResource,
    savesByResource,
    requestsByResource,
    regional,
  };
}

async function listApprovedReviews(limit = 24) {
  const sql = getSqlClient();
  if (!sql) return [];
  return sql(
    `SELECT id, quote, author_display, role_display, region_code, created_at
     FROM engagement_reviews
     WHERE approved = TRUE
     ORDER BY created_at DESC
     LIMIT $1`,
    [limit]
  );
}

async function submitReview({ profileId, quote, authorDisplay, roleDisplay, regionCode }) {
  const sql = getSqlClient();
  if (!sql) return { ok: false, error: "database_unavailable" };
  await sql(
    `INSERT INTO engagement_reviews (profile_id, quote, author_display, role_display, region_code, approved)
     VALUES ($1, $2, $3, $4, $5, FALSE)`,
    [profileId || null, quote, authorDisplay, roleDisplay || "", regionCode || ""]
  );
  try {
    await saveEvent({
      projectKey: "resumora",
      eventType: "engagement_review_submit",
      severity: "info",
      source: "engagement",
      payload: { regionCode: regionCode || "" },
    });
  } catch {
    /* optional */
  }
  return { ok: true };
}

async function userEngagementState(profileId, visitorId, resourceKeys) {
  const sql = getSqlClient();
  if (!sql || (!profileId && !visitorId)) {
    return { likes: new Set(), saves: new Set(), dislikes: new Set(), following: false };
  }
  const keys = resourceKeys.length ? resourceKeys : ["_none_"];
  const actorCol = profileId ? "profile_id" : "visitor_id";
  const actorVal = profileId || visitorId;
  const likes = await sql(
    `SELECT resource_key FROM engagement_likes WHERE ${actorCol} = $1 AND resource_key = ANY($2::text[])`,
    [actorVal, keys]
  );
  const saves = await sql(
    `SELECT resource_key FROM engagement_saves WHERE ${actorCol} = $1 AND resource_key = ANY($2::text[])`,
    [actorVal, keys]
  );
  const dislikes = await sql(
    `SELECT resource_key FROM engagement_dislikes WHERE ${actorCol} = $1 AND resource_key = ANY($2::text[])`,
    [actorVal, keys]
  );
  let following = false;
  if (actorVal) {
    const f = await sql(`SELECT 1 FROM engagement_follows WHERE ${actorCol} = $1 AND target = 'resumora'`, [actorVal]);
    following = f.length > 0;
  }
  return {
    likes: new Set(likes.map((r) => r.resource_key)),
    saves: new Set(saves.map((r) => r.resource_key)),
    dislikes: new Set(dislikes.map((r) => r.resource_key)),
    following,
  };
}

module.exports = {
  ensureVisitor,
  registerProfile,
  loginProfile,
  createSession,
  resolveSession,
  destroySession,
  toggleLike,
  toggleDislike,
  toggleSave,
  recordRequest,
  recordShare,
  toggleFollowBrand,
  getAggregateStats,
  listApprovedReviews,
  submitReview,
  userEngagementState,
};
