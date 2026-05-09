const { registerProfile, createSession } = require("../../../lib/engagement/store");
const { serializeCookie, COOKIE_SESSION } = require("../../../lib/engagement/cookies");
const { getSqlClient } = require("../../../lib/shared/neon-memory");

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!getSqlClient()) {
    return res.status(503).json({ error: "Database unavailable" });
  }

  const { email, password, displayName } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: "Email and password required" });
  }

  try {
    const result = await registerProfile({ email, password, displayName: displayName || "" });
    if (!result.ok) {
      return res.status(409).json({ error: result.error || "register_failed" });
    }

    const session = await createSession(result.profile.id);
    if (!session) {
      return res.status(500).json({ error: "Session failed" });
    }

    const cookie = serializeCookie(COOKIE_SESSION, session.token, { maxAge: 14 * 24 * 60 * 60 });
    res.setHeader("Set-Cookie", cookie);

    return res.status(201).json({
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
