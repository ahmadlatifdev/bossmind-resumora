/**
 * Railway / n8n → BossMind incident ingress (queues closed-loop repair for supervisor worker).
 * Auth: Bearer BOSSMIND_RAILWAY_WEBHOOK_SECRET (preferred) or BOSSMIND_ORCHESTRATION_SECRET.
 */
const {
  initializeSharedMemory,
  saveEvent,
  upsertTaskState,
} = require("../../../lib/shared/neon-memory");
const { fingerprintFromPayload } = require("../../../lib/orchestration/railway-closed-loop-worker");

const PROJECT_KEY = process.env.BOSSMIND_PROJECT_KEY || "resumora";

function authorize(req) {
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  const a = process.env.BOSSMIND_RAILWAY_WEBHOOK_SECRET || process.env.BOSSMIND_ORCHESTRATION_SECRET;
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

  const deploymentId =
    body.deploymentId || body.deployment_id || body.id || body.railwayDeploymentId || `ts-${Date.now()}`;
  const taskKey =
    typeof body.taskKey === "string" && body.taskKey.trim()
      ? body.taskKey.trim()
      : `railway_repair:${deploymentId}`;

  const fp = body.errorFingerprint || fingerprintFromPayload(body);

  const payload = {
    job: "railway_closed_loop",
    deploymentId: String(deploymentId),
    crashMessage: String(body.crashMessage || body.message || body.text || "").slice(0, 12000),
    serviceId: body.serviceId || body.service_id || "",
    railwayProjectId: body.railwayProjectId || body.projectId || "",
    railwayEnvironmentId: body.railwayEnvironmentId || body.environmentId || "",
    railwayServiceId: body.railwayServiceId || body.railway_service_id || "",
    source: body.source || "railway.webhook",
    rawMeta: typeof body.meta === "object" ? body.meta : {},
    errorFingerprint: fp,
  };

  await upsertTaskState({
    projectKey: PROJECT_KEY,
    taskKey,
    status: "pending",
    assignedAgent: "railway-incident-webhook",
    payload,
  });

  await saveEvent({
    projectKey: PROJECT_KEY,
    eventType: "railway.incident.queued",
    severity: "info",
    source: "api.railway-incident-webhook",
    eventKey: taskKey,
    payload: { deploymentId: payload.deploymentId, fingerprint: fp },
  });

  return res.status(202).json({ ok: true, queued: true, taskKey });
}
