require("../../../../lib/shared/ensure-project-env");
const { requireDatabaseReady } = require("../../../../lib/shared/require-database");
const { verifyPasswordResetCode } = require("../../../../lib/engagement/password-reset");

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const dbGate = await requireDatabaseReady();
  if (!dbGate.ok) return res.status(dbGate.status).json(dbGate.body);

  const { email, code } = req.body || {};
  try {
    const result = await verifyPasswordResetCode({ email, code });
    if (!result.ok) {
      const status =
        result.error === "code_expired" || result.error === "too_many_attempts" ? 403 : 401;
      return res.status(status).json({ error: result.error });
    }
    return res.status(200).json({ ok: true, verified: true });
  } catch (e) {
    return res.status(500).json({ error: e.message || "Server error" });
  }
}
