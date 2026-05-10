const { createStripeServerClient } = require("../../lib/marketing/stripe-server");
const { getSqlClient, saveEvent } = require("../../lib/shared/neon-memory");

function bossmindProjectKey() {
  return process.env.BOSSMIND_PROJECT_KEY || "resumora";
}

export default async function handler(req, res) {
  const { session_id } = req.query;
  if (!session_id) return res.status(400).json({ valid: false });

  const { stripe } = createStripeServerClient();
  if (!stripe) {
    return res.status(503).json({ valid: false, error: "stripe_unconfigured" });
  }

  const projectKey = bossmindProjectKey();

  try {
    const session = await stripe.checkout.sessions.retrieve(String(session_id));
    const valid = session.payment_status === "paid";

    if (valid) {
      const eventKey = `checkout:${session.id}`;
      const sql = getSqlClient();
      let already = false;
      if (sql) {
        const rows = await sql(
          `SELECT 1 FROM event_log WHERE project_key = $1 AND event_key = $2 LIMIT 1`,
          [projectKey, eventKey]
        );
        already = Array.isArray(rows) && rows.length > 0;
      }
      if (!already) {
        await saveEvent({
          projectKey,
          eventType: "stripe_checkout_paid",
          severity: "info",
          source: "stripe",
          eventKey,
          payload: {
            amount_total: session.amount_total,
            currency: session.currency,
            metadata: session.metadata || {},
            utm_source: session.metadata?.utm_source,
            utm_medium: session.metadata?.utm_medium,
            utm_campaign: session.metadata?.utm_campaign,
          },
        });
      }
    }

    res.status(200).json({ valid });
  } catch {
    res.status(200).json({ valid: false });
  }
}
