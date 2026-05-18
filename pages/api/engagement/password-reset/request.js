require("../../../../lib/shared/ensure-project-env");
const { requireDatabaseReady } = require("../../../../lib/shared/require-database");
const { requestPasswordReset } = require("../../../../lib/engagement/password-reset");

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const dbGate = await requireDatabaseReady();
  if (!dbGate.ok) return res.status(dbGate.status).json(dbGate.body);

  const { email, phone, lang, channel } = req.body || {};
  try {
    const result = await requestPasswordReset({ email, phone, lang, channel });
    if (result.error === "rate_limited") {
      return res.status(429).json({ error: "rate_limited", retryAfterSec: 3600 });
    }
    if (!result.ok) {
      return res.status(result.retryable ? 503 : 400).json(result);
    }
    return res.status(200).json({ ok: true, message: result.message });
  } catch (e) {
    return res.status(500).json({ error: e.message || "Server error" });
  }
}
