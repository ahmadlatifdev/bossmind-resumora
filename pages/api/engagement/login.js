const { loginProfile, createSession } = require("../../../lib/engagement/store");
const { linkEntitlementsToProfile } = require("../../../lib/essential-advanced/entitlements-store");
const { serializeCookie, COOKIE_SESSION } = require("../../../lib/engagement/cookies");
const {
  getSqlClient,
  ensureEngagementSchema,
  getDatabaseConfigStatus,
} = require("../../../lib/shared/neon-memory");

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const init = await ensureEngagementSchema();
  if (!init.enabled || !getSqlClient()) {
    const db = getDatabaseConfigStatus();
    return res.status(503).json({
      error: "Database unavailable",
      reason: init.reason || db.source || "no_database_url",
    });
  }

  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: "Email and password required" });
  }

  try {
    const result = await loginProfile(email, password);
    if (!result.ok) {
      return res.status(401).json({ error: result.error || "invalid_credentials" });
    }

    await linkEntitlementsToProfile(result.profile.id, result.profile.email);

    const session = await createSession(result.profile.id);
    if (!session) {
      return res.status(500).json({ error: "Session failed" });
    }

    const cookie = serializeCookie(COOKIE_SESSION, session.token, { maxAge: 14 * 24 * 60 * 60 });
    res.setHeader("Set-Cookie", cookie);

    return res.status(200).json({
      ok: true,
      profile: {
        id: result.profile.id,
        email: result.profile.email,
        displayName: result.profile.display_name ?? "",
      },
    });
  } catch (e) {
    return res.status(500).json({ error: e.message || "Server error" });
  }
}
