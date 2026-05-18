require("../../../../lib/shared/ensure-project-env");
const { requireDatabaseReady } = require("../../../../lib/shared/require-database");
const { completePasswordReset } = require("../../../../lib/engagement/password-reset");
const { serializeCookie, COOKIE_SESSION } = require("../../../../lib/engagement/cookies");

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const dbGate = await requireDatabaseReady();
  if (!dbGate.ok) return res.status(dbGate.status).json(dbGate.body);

  const { email, code, password } = req.body || {};
  try {
    const result = await completePasswordReset({ email, code, newPassword: password });
    if (!result.ok) {
      const status =
        result.error === "code_expired" || result.error === "too_many_attempts" ? 403 : 401;
      return res.status(status).json({ error: result.error });
    }
    if (result.session?.token) {
      const cookie = serializeCookie(COOKIE_SESSION, result.session.token, {
        maxAge: 14 * 24 * 60 * 60,
      });
      res.setHeader("Set-Cookie", cookie);
    }
    return res.status(200).json({ ok: true, sessionRestored: Boolean(result.session) });
  } catch (e) {
    return res.status(500).json({ error: e.message || "Server error" });
  }
}
