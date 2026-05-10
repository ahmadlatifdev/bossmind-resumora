/**
 * Authenticated ingress for Sentry → BossMind repair chain (same worker as run-repair).
 * Point Sentry “Webhook” or external relay here with BOSSMIND_ORCHESTRATION_SECRET.
 */
const { runRepairFlow } = require("../../../lib/orchestration/langgraph-repair-flow");
const {
  initializeSharedMemory,
  saveEvent,
  upsertTaskState,
} = require("../../../lib/shared/neon-memory");

const PROJECT_KEY = process.env.BOSSMIND_PROJECT_KEY || "resumora";

function authorize(req) {
  const secret = process.env.BOSSMIND_ORCHESTRATION_SECRET;
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  return secret && token === secret;
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
    return res.status(503).json({
      error: "Shared memory is not enabled",
      details: init.reason,
    });
  }

  const body = req.body && typeof req.body === "object" ? req.body : {};
  const sentryEvent = body.sentryEvent || {
    eventId: body.eventId || body.id || `ingest-${Date.now()}`,
    errorType: body.errorType || body.title || "ingested_error",
    errorMessage: body.errorMessage || body.message || body.culprit || "Unknown",
    stack: body.stack || body.stacktrace || "",
    rootCause: body.rootCause || "",
  };

  const validationResult = body.validationResult || { ok: false, details: "Awaiting CI validation" };
  const deployResult = body.deployResult || { ok: false, details: "Deploy external to Railway" };

  if (process.env.BOSSMIND_SENTRY_ENQUEUE_ONLY === "1") {
    try {
      const taskKey =
        typeof body.taskKey === "string" && body.taskKey.trim()
          ? body.taskKey.trim()
          : `sentry:${sentryEvent.eventId || Date.now()}`;
      await upsertTaskState({
        projectKey: PROJECT_KEY,
        taskKey,
        status: "pending",
        assignedAgent: "sentry-ingest-queue",
        payload: {
          job: "run_repair",
          sentryEvent,
          validationResult,
          deployResult,
          source: "sentry.ingest",
        },
      });
      await saveEvent({
        projectKey: PROJECT_KEY,
        eventType: "sentry.repair.queued",
        severity: "info",
        source: "api.sentry-ingest",
        eventKey: taskKey,
        payload: { sentryEventId: sentryEvent.eventId },
      });
      return res.status(202).json({ ok: true, queued: true, taskKey });
    } catch (error) {
      await saveEvent({
        projectKey: PROJECT_KEY,
        eventType: "sentry.queue.failed",
        severity: "error",
        source: "api.sentry-ingest",
        payload: { message: error.message },
      });
      return res.status(500).json({ error: error.message || "Queue enqueue failed" });
    }
  }

  try {
    const result = await runRepairFlow({
      projectKey: PROJECT_KEY,
      sentryEvent,
      validationResult,
      deployResult,
    });
    return res.status(200).json({ ok: true, result });
  } catch (error) {
    await saveEvent({
      projectKey: PROJECT_KEY,
      eventType: "sentry.ingest.failed",
      severity: "error",
      source: "api.sentry-ingest",
      payload: { message: error.message },
    });
    return res.status(500).json({ error: error.message || "Ingest failed" });
  }
}
