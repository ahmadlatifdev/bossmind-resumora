/**
 * AI Video queue + dashboard aggregate (BossMind controller surface).
 */
const { initializeSharedMemory } = require("../../../../lib/shared/neon-memory");
const store = require("../../../../lib/orchestration/bossmind-ai-video-store");
const { authorizeAdmin } = require("../../../../lib/orchestration/bossmind-ai-video-auth");

export default async function handler(req, res) {
  if (!authorizeAdmin(req)) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  const init = await initializeSharedMemory();
  if (!init.enabled) {
    return res.status(503).json({ error: "Neon unavailable", details: init.reason });
  }

  const r = await store.ensureDb();
  if (!r.ok) {
    return res.status(503).json({ error: "Database unavailable", details: r.reason });
  }
  const { sql } = r;

  if (req.method === "GET") {
    const status = typeof req.query.status === "string" ? req.query.status : null;
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 50));
    const rows = await store.listQueue(sql, { limit, status: status || null });
    return res.status(200).json({ ok: true, projectKey: store.projectKey(), items: rows });
  }

  if (req.method === "POST") {
    const body = typeof req.body === "object" && req.body ? req.body : {};
    const title = typeof body.title === "string" ? body.title.slice(0, 500) : "";
    const rawScript = typeof body.rawScript === "string" ? body.rawScript.slice(0, 500_000) : "";
    const source = typeof body.source === "string" ? body.source.slice(0, 80) : "dashboard";
    const language = typeof body.language === "string" ? body.language.slice(0, 32) : "en";
    const autoPublish = Boolean(body.auto_publish);
    const platforms = Array.isArray(body.target_platforms) ? body.target_platforms.map(String).slice(0, 8) : [];
    const priority = Number(body.priority) || 0;

    const q = await store.insertQueue(sql, {
      title: title || null,
      source,
      language,
      auto_publish: autoPublish,
      target_platforms: platforms.length ? platforms : ["youtube"],
      priority,
      status: "pending",
      payload: body.payload && typeof body.payload === "object" ? body.payload : {},
    });

    if (rawScript) {
      await store.insertScript(sql, { queueId: q.id, rawText: rawScript, meta: { intake: "dashboard" } });
      await store.updateQueue(sql, q.id, { status: "script_review" });
    }

    const nm = require("../../../../lib/shared/neon-memory");
    await nm.saveEvent({
      projectKey: store.projectKey(),
      eventType: "ai_video.queue_created",
      source: "ai-video-queue-api",
      eventKey: `q:${q.id}`,
      payload: { queueId: q.id, source },
    });

    const fresh = await store.getQueueById(sql, q.id);
    return res.status(201).json({ ok: true, item: fresh });
  }

  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ error: "Method not allowed" });
}
