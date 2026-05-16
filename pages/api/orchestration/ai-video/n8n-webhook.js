/**
 * n8n / Railway worker callbacks — Bearer BOSSMIND_AI_VIDEO_N8N_SECRET.
 * Body: { action, ... } — see config/bossmind-ai-video-stack.json
 */
const { initializeSharedMemory } = require("../../../../lib/shared/neon-memory");
const store = require("../../../../lib/orchestration/bossmind-ai-video-store");
const { authorizeN8n } = require("../../../../lib/orchestration/bossmind-ai-video-auth");
const neon = require("../../../../lib/shared/neon-memory");

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (!authorizeN8n(req)) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  await initializeSharedMemory();
  const r = await store.ensureDb();
  if (!r.ok) return res.status(503).json({ error: r.reason });
  const { sql } = r;

  const body = typeof req.body === "object" && req.body ? req.body : {};
  const action = typeof body.action === "string" ? body.action : "";

  if (action === "ingest_row") {
    const title = typeof body.title === "string" ? body.title.slice(0, 500) : "Sheet row";
    const rawScript = typeof body.rawScript === "string" ? body.rawScript.slice(0, 500_000) : "";
    const external_ref = typeof body.external_ref === "string" ? body.external_ref.slice(0, 200) : null;
    const q = await store.insertQueue(sql, {
      title,
      source: "google_sheets",
      external_ref,
      status: rawScript ? "script_review" : "pending",
      auto_publish: Boolean(body.auto_publish),
      target_platforms: Array.isArray(body.target_platforms) ? body.target_platforms : ["youtube"],
      language: typeof body.language === "string" ? body.language : "en",
      payload: { sheet: body.sheetMeta || {} },
    });
    if (rawScript) {
      await store.insertScript(sql, { queueId: q.id, rawText: rawScript, meta: { source: "sheets" } });
    }
    await neon.saveEvent({
      projectKey: store.projectKey(),
      eventType: "ai_video.n8n_ingest",
      source: "ai-video-n8n-webhook",
      eventKey: `ingest:${q.id}`,
      payload: { queueId: q.id, external_ref },
    });
    return res.status(201).json({ ok: true, queueId: q.id });
  }

  if (action === "queue_status") {
    const queueId = Number(body.queueId);
    if (!queueId) return res.status(400).json({ error: "queueId required" });
    const item = await store.updateQueue(sql, queueId, {
      status: typeof body.status === "string" ? body.status.slice(0, 80) : "pending",
      payload: body.payload && typeof body.payload === "object" ? body.payload : undefined,
    });
    return res.status(200).json({ ok: true, item });
  }

  if (action === "log_api_usage") {
    await store.logApiUsage(sql, {
      provider: String(body.provider || "unknown").slice(0, 80),
      operation: typeof body.operation === "string" ? body.operation.slice(0, 120) : null,
      units: body.units != null ? Number(body.units) : null,
      cost_usd: body.cost_usd != null ? Number(body.cost_usd) : null,
      external_id: typeof body.external_id === "string" ? body.external_id.slice(0, 200) : null,
      meta: body.meta && typeof body.meta === "object" ? body.meta : {},
    });
    return res.status(200).json({ ok: true });
  }

  if (action === "automation_memory") {
    const key = typeof body.memory_key === "string" ? body.memory_key.slice(0, 200) : "";
    if (!key) return res.status(400).json({ error: "memory_key required" });
    await store.upsertAutomationMemory(sql, key, body.payload && typeof body.payload === "object" ? body.payload : {});
    return res.status(200).json({ ok: true });
  }

  return res.status(400).json({ error: "unknown action", allowed: ["ingest_row", "queue_status", "log_api_usage", "automation_memory"] });
}
