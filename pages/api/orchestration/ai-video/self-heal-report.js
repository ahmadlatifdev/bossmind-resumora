/**
 * Self-heal hook: log step failure + Neon error_memory pattern (DeepSeek analysis in n8n / worker).
 */
const crypto = require("crypto");
const { initializeSharedMemory } = require("../../../../lib/shared/neon-memory");
const store = require("../../../../lib/orchestration/bossmind-ai-video-store");
const { authorizeN8n, authorizeAdmin } = require("../../../../lib/orchestration/bossmind-ai-video-auth");
const neon = require("../../../../lib/shared/neon-memory");

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (!authorizeN8n(req) && !authorizeAdmin(req)) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  await initializeSharedMemory();
  const r = await store.ensureDb();
  if (!r.ok) return res.status(503).json({ error: r.reason });
  const { sql } = r;

  const body = typeof req.body === "object" && req.body ? req.body : {};
  const message = typeof body.message === "string" ? body.message.slice(0, 8000) : "";
  const step = typeof body.step === "string" ? body.step.slice(0, 200) : "unknown";
  const queueId = body.queueId != null ? Number(body.queueId) : null;
  const fp =
    typeof body.fingerprint === "string" && body.fingerprint.length > 8
      ? body.fingerprint.slice(0, 128)
      : crypto.createHash("sha256").update(`${step}|${message.slice(0, 500)}`).digest("hex");
  const rootCause = typeof body.root_cause === "string" ? body.root_cause.slice(0, 2000) : "";
  const fixPattern = typeof body.fix_pattern === "string" ? body.fix_pattern.slice(0, 2000) : "";

  await store.logVideoError(sql, {
    queueId: queueId && Number.isFinite(queueId) ? queueId : null,
    step,
    fingerprint: fp,
    message: message || "error",
    payload: body.payload && typeof body.payload === "object" ? body.payload : {},
  });

  await neon.upsertErrorMemory({
    projectKey: store.projectKey(),
    errorType: `ai_video:${step}`,
    errorMessage: (message || "error").slice(0, 2000),
    stackExcerpt: typeof body.stack === "string" ? body.stack.slice(0, 4000) : "",
    rootCause,
    fixPattern,
  });

  await neon.saveEvent({
    projectKey: store.projectKey(),
    eventType: "ai_video.self_heal_report",
    severity: "warning",
    source: "ai-video-self-heal-api",
    eventKey: `heal:${Date.now()}`,
    payload: { queueId, step, fingerprint: fp },
  });

  return res.status(200).json({ ok: true, retryRecommended: Boolean(body.retry_recommended) });
}
