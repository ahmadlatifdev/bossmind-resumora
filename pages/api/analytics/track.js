const { getSqlClient, saveEvent, ensureSharedMemoryInitialized } = require("../../../lib/shared/neon-memory");

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { path: pagePath, referrer, lang, source, campaign, meta } = req.body || {};

  try {
    await ensureSharedMemoryInitialized();
  } catch {
    /* continue without blocking client beacon */
  }

  const sql = getSqlClient();
  if (sql && pagePath) {
    try {
      await sql(
        `INSERT INTO analytics_web_events (path, referrer, lang, source, campaign, meta)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
        [
          String(pagePath).slice(0, 512),
          referrer ? String(referrer).slice(0, 512) : null,
          lang ? String(lang).slice(0, 8) : null,
          source ? String(source).slice(0, 128) : null,
          campaign ? String(campaign).slice(0, 128) : null,
          JSON.stringify(meta && typeof meta === "object" ? meta : {}),
        ]
      );
    } catch {
      /* ignore */
    }
  }

  try {
    await saveEvent({
      projectKey: "resumora",
      eventType: "web_analytics",
      severity: "info",
      source: source || "client",
      payload: { path: pagePath, lang, campaign },
    });
  } catch {
    /* optional */
  }

  return res.status(204).end();
}
