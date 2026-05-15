/**
 * n8n pre-send dedupe: one auto-reply claim per inbound Gmail Message-Id (Neon task_state).
 * Auth: Bearer BOSSMIND_SUPPORT_WEBHOOK_SECRET (preferred) or BOSSMIND_ORCHESTRATION_SECRET.
 */
const {
  initializeSharedMemory,
  saveEvent,
  tryClaimSupportMailSend,
} = require("../../../lib/shared/neon-memory");

const PROJECT_KEY = process.env.BOSSMIND_PROJECT_KEY || "resumora";

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

  const init = await initializeSharedMemory();
  if (!init.enabled) {
    return res.status(503).json({ error: "Shared memory unavailable", details: init.reason });
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

  const messageId = typeof body.messageId === "string" ? body.messageId.trim() : "";
  const threadId = typeof body.threadId === "string" ? body.threadId.trim() : "";
  if (messageId.length < 8) {
    return res.status(400).json({ error: "messageId required (min 8 chars)" });
  }

  const meta = {
    routeId: typeof body.routeId === "string" ? body.routeId.slice(0, 120) : "",
    source: typeof body.source === "string" ? body.source.slice(0, 120) : "n8n",
  };

  const claim = await tryClaimSupportMailSend({
    projectKey: PROJECT_KEY,
    messageId,
    threadId,
    meta,
  });

  if (!claim.ok) {
    return res.status(500).json({ error: "claim_failed", details: claim.reason || "unknown" });
  }

  await saveEvent({
    projectKey: PROJECT_KEY,
    eventType: claim.duplicate ? "support_mail.dedupe_replay_blocked" : "support_mail.dedupe_claimed",
    severity: "info",
    source: "support-mail-dedupe-api",
    eventKey: `dedupe:${messageId.slice(0, 200)}`,
    payload: {
      duplicate: claim.duplicate,
      taskKey: claim.taskKey,
      threadIdLen: threadId.length,
    },
  });

  return res.status(200).json({
    ok: true,
    duplicate: claim.duplicate,
    sendAutoReply: claim.claimed,
    taskKey: claim.taskKey,
  });
}
