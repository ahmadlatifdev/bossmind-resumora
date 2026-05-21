require("../../../lib/shared/ensure-project-env");
const { readEngagementActor } = require("../../../lib/engagement/http-context");
const { ensureEngagementSchema } = require("../../../lib/shared/neon-memory");
const { bootstrapClientCheckout } = require("../../../lib/client/checkout-bootstrap");

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const lang = String(req.query.lang || "en").toLowerCase() === "fr" ? "fr" : "en";
  const sessionId = String(req.query.session_id || "").trim();

  try {
    await ensureEngagementSchema();
    const actor = await readEngagementActor(req, res);
    const payload = await bootstrapClientCheckout(actor, { sessionId: sessionId || null, lang });
    return res.status(200).json({ ok: true, ...payload });
  } catch (e) {
    return res.status(500).json({ error: e.message || "bootstrap_failed" });
  }
}
