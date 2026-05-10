/**
 * Central BossMind orchestration readout + task hooks (Railway/Node — not for untrusted public traffic).
 * Authorization: Bearer BOSSMIND_ORCHESTRATION_SECRET (same as sentry-ingest).
 *
 * GET ?format=json|html — runtime, Neon recent rows, bundle hints, git HEAD.
 * POST actions: repair | enqueue | heartbeat | noop
 */
const { runRepairFlow } = require("../../../lib/orchestration/langgraph-repair-flow");
const {
  initializeSharedMemory,
  saveEvent,
  upsertTaskState,
} = require("../../../lib/shared/neon-memory");
const {
  getBossMindRuntimeOverview,
  renderOverviewHtml,
} = require("../../../lib/orchestration/bossmind-runtime-status");

const PROJECT_KEY = process.env.BOSSMIND_PROJECT_KEY || "resumora";

function authorize(req) {
  const secret = process.env.BOSSMIND_ORCHESTRATION_SECRET;
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  return Boolean(secret && token === secret);
}

export default async function handler(req, res) {
  if (!authorize(req)) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const init = await initializeSharedMemory();
  const neonOk = Boolean(init.enabled);

  if (req.method === "GET") {
    const overview = await getBossMindRuntimeOverview({
      projectKey: PROJECT_KEY,
      neonEnabled: neonOk,
    });
    const fmt = req.query.format === "html" ? "html" : "json";
    if (fmt === "html") {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      return res.status(200).send(renderOverviewHtml(overview));
    }
    return res.status(200).json({ ok: true, neonConfigured: neonOk, ...overview });
  }

  if (req.method === "POST") {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const action = body.action || "noop";

    try {
      if (action === "heartbeat" && !neonOk) {
        return res.status(200).json({ ok: true, action: "heartbeat", neonPersisted: false });
      }

      if (!neonOk && action !== "noop") {
        return res.status(503).json({
          error: "Shared memory is not enabled",
          details: init.reason,
        });
      }

      if (action === "repair") {
        const sentryEvent = body.sentryEvent || {
          eventId: `control-${Date.now()}`,
          errorType: body.errorType || "manual_control",
          errorMessage: body.errorMessage || "Triggered via bossmind-control",
          stack: body.stack || "",
        };
        const validationResult = body.validationResult || { ok: false, details: "Pending CI" };
        const deployResult = body.deployResult || { ok: false, details: "Railway external" };
        const result = await runRepairFlow({
          projectKey: PROJECT_KEY,
          sentryEvent,
          validationResult,
          deployResult,
        });
        return res.status(200).json({ ok: true, action: "repair", result });
      }

      if (action === "enqueue") {
        const taskKey = body.taskKey || `orch:${Date.now()}`;
        await upsertTaskState({
          projectKey: PROJECT_KEY,
          taskKey,
          status: body.status || "pending",
          assignedAgent: body.assignedAgent || "orchestrator",
          payload: body.payload || {},
        });
        await saveEvent({
          projectKey: PROJECT_KEY,
          eventType: "orchestration.enqueue",
          severity: "info",
          source: "bossmind-control",
          payload: { taskKey },
        });
        return res.status(200).json({ ok: true, action: "enqueue", taskKey });
      }

      if (action === "heartbeat") {
        await saveEvent({
          projectKey: PROJECT_KEY,
          eventType: "orchestration.heartbeat",
          severity: "info",
          source: body.source || "bossmind-control-client",
          payload: body.payload || {},
        });
        return res.status(200).json({ ok: true, action: "heartbeat" });
      }

      return res.status(200).json({ ok: true, action: "noop" });
    } catch (error) {
      if (neonOk) {
        await saveEvent({
          projectKey: PROJECT_KEY,
          eventType: "bossmind.control.failed",
          severity: "error",
          source: "bossmind-control",
          payload: { message: error.message, action },
        });
      }
      return res.status(500).json({ error: error.message || "Control action failed" });
    }
  }

  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ error: "Method not allowed" });
}
