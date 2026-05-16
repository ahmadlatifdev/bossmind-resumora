/**
 * Heuristic support-mail classification for n8n (Bearer BOSSMIND_SUPPORT_WEBHOOK_SECRET).
 * Does not call external LLMs; DeepSeek/OpenAI stay in n8n per architecture JSON.
 */
const path = require("path");
const { initializeSharedMemory, saveEvent } = require("../../../lib/shared/neon-memory");
const { classifySupportIntake } = require("../../../lib/orchestration/resumora-support-mail-classify");

const PROJECT_KEY = process.env.BOSSMIND_PROJECT_KEY || "resumora";
const root = path.join(__dirname, "..", "..", "..");

function authorize(req) {
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  const a =
    process.env.BOSSMIND_SUPPORT_WEBHOOK_SECRET ||
    process.env.BOSSMIND_ORCHESTRATION_SECRET ||
    process.env.BOSSMIND_RAILWAY_WEBHOOK_SECRET;
  return Boolean(a && token === a);
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!authorize(req)) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const body =
    req.body && typeof req.body === "object"
      ? req.body
      : (() => {
          try {
            return JSON.parse(req.body || "{}");
          } catch {
            return {};
          }
        })();

  const subject = typeof body.subject === "string" ? body.subject.slice(0, 500) : "";
  const bodyText = typeof body.body === "string" ? body.body.slice(0, 8000) : "";
  const hasAttachment = Boolean(body.hasAttachment);

  let classification;
  try {
    classification = classifySupportIntake(root, { subject, body: bodyText, hasAttachment });
  } catch (e) {
    return res.status(500).json({ error: "classify_failed", details: e.message || String(e) });
  }

  const init = await initializeSharedMemory();
  if (init.enabled) {
    await saveEvent({
      projectKey: PROJECT_KEY,
      eventType: "support_mail.classified_heuristic",
      severity: "info",
      source: "support-mail-classify-api",
      eventKey: `classify:${Date.now()}`,
      payload: {
        routeId: classification.routeId,
        priority: classification.priority,
        urgent: classification.urgent,
        tags: classification.tags,
        engine: classification.engine,
        subjectLen: subject.length,
        bodyLen: bodyText.length,
        hasAttachment,
      },
    });
  }

  return res.status(200).json({
    ok: true,
    classification,
    neonLogged: init.enabled,
  });
}
