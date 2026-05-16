/**
 * AI Video dashboard aggregate (counts, recent errors, publishes).
 */
const { initializeSharedMemory } = require("../../../../lib/shared/neon-memory");
const store = require("../../../../lib/orchestration/bossmind-ai-video-store");
const { authorizeAdmin } = require("../../../../lib/orchestration/bossmind-ai-video-auth");

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (!authorizeAdmin(req)) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  await initializeSharedMemory();
  const summary = await store.getDashboardSummary();
  if (!summary.ok) {
    return res.status(503).json({ error: summary.reason });
  }
  return res.status(200).json(summary);
}
