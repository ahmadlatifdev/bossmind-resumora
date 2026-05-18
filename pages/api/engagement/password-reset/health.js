require("../../../../lib/shared/ensure-project-env");
const { auditPasswordResetHealth } = require("../../../../lib/engagement/password-reset");
const { probeDatabaseConnection } = require("../../../../lib/shared/neon-memory");

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const db = await probeDatabaseConnection();
  const reset = await auditPasswordResetHealth();
  return res.status(200).json({
    ok: db.ok && reset.ok,
    ts: Date.now(),
    database: db,
    passwordReset: reset,
  });
}
