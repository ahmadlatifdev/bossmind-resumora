const { getSqlClient, saveEvent } = require("../../../lib/shared/neon-memory");

function isoWeekNow() {
  const d = new Date();
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((date - yearStart) / 86400000 + 1) / 7);
  return { year: date.getUTCFullYear(), week: weekNo };
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  let lang = "en";
  try {
    const body = typeof req.body === "object" && req.body ? req.body : JSON.parse(req.body || "{}");
    if (body.lang === "fr" || body.lang === "en") lang = body.lang;
  } catch {
    /* default */
  }

  const { year, week } = isoWeekNow();
  const weekId = `${year}-W${String(week).padStart(2, "0")}`;

  const sql = getSqlClient();
  if (sql) {
    try {
      await sql(`INSERT INTO marketing_week_log (week_id, lang) VALUES ($1, $2)`, [weekId, lang]);
    } catch {
      /* ignore */
    }
  }

  try {
    await saveEvent({
      projectKey: "resumora",
      eventType: "marketing_week_view",
      severity: "info",
      source: "homepage",
      payload: { weekId, lang },
    });
  } catch {
    /* optional */
  }

  return res.status(204).end();
}
