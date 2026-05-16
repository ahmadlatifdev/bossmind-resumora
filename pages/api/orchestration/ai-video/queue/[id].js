/**
 * Single queue item: GET / PATCH (status, script review, flags).
 */
const { initializeSharedMemory } = require("../../../../../lib/shared/neon-memory");
const store = require("../../../../../lib/orchestration/bossmind-ai-video-store");
const { authorizeAdmin } = require("../../../../../lib/orchestration/bossmind-ai-video-auth");
const neon = require("../../../../../lib/shared/neon-memory");

export default async function handler(req, res) {
  if (!authorizeAdmin(req)) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const id = Number(req.query.id);
  if (!Number.isFinite(id) || id < 1) {
    return res.status(400).json({ error: "invalid id" });
  }

  await initializeSharedMemory();
  const r = await store.ensureDb();
  if (!r.ok) return res.status(503).json({ error: r.reason });
  const { sql } = r;

  if (req.method === "GET") {
    const item = await store.getQueueById(sql, id);
    if (!item) return res.status(404).json({ error: "not found" });
    return res.status(200).json({ ok: true, item });
  }

  if (req.method === "PATCH") {
    const body = typeof req.body === "object" && req.body ? req.body : {};
    const patch = {};
    if (typeof body.status === "string") patch.status = body.status.slice(0, 80);
    if (body.review_status === "approved" && !patch.status) patch.status = "scenario_build";
    if (typeof body.priority === "number") patch.priority = body.priority;
    if (typeof body.auto_publish === "boolean") patch.auto_publish = body.auto_publish;
    if (Array.isArray(body.target_platforms)) patch.target_platforms = body.target_platforms.map(String).slice(0, 8);
    if (typeof body.language === "string") patch.language = body.language.slice(0, 32);
    if (typeof body.title === "string") patch.title = body.title.slice(0, 500);
    if (body.payload && typeof body.payload === "object") patch.payload = body.payload;

    const item = await store.updateQueue(sql, id, patch);

    if (body.reviewed_text != null || body.review_status || body.reviewer_notes != null) {
      await store.updateScriptReview(sql, id, {
        reviewed_text: typeof body.reviewed_text === "string" ? body.reviewed_text : undefined,
        review_status: typeof body.review_status === "string" ? body.review_status.slice(0, 40) : undefined,
        reviewer_notes: typeof body.reviewer_notes === "string" ? body.reviewer_notes.slice(0, 2000) : undefined,
      });
    }

    await neon.saveEvent({
      projectKey: store.projectKey(),
      eventType: "ai_video.queue_patched",
      source: "ai-video-queue-id-api",
      eventKey: `q:${id}`,
      payload: { queueId: id, patch: Object.keys(body) },
    });

    if (!item) return res.status(404).json({ error: "not found" });
    return res.status(200).json({ ok: true, item });
  }

  res.setHeader("Allow", "GET, PATCH");
  return res.status(405).json({ error: "Method not allowed" });
}
