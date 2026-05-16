/**
 * Full job tree for dashboard: queue, script, scenario, scenes, assets, renders, publishes.
 * GET /api/orchestration/ai-video/job/:id
 */
const { initializeSharedMemory } = require("../../../../../lib/shared/neon-memory");
const store = require("../../../../../lib/orchestration/bossmind-ai-video-store");
const { authorizeAdmin } = require("../../../../../lib/orchestration/bossmind-ai-video-auth");

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }
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

  const detail = await store.getJobDetail(sql, id);
  if (!detail) return res.status(404).json({ error: "not found" });

  return res.status(200).json({ ok: true, projectKey: store.projectKey(), ...detail });
}
