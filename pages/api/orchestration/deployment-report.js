/**
 * Record deployment / verification outcomes into Neon deployment_history (BossMind audit trail).
 */
const { initializeSharedMemory, saveDeploymentHistory } = require("../../../lib/shared/neon-memory");

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
  const status = String(body.status || "unknown").slice(0, 64);
  const summary = String(body.summary || "").slice(0, 2000);
  const commitHash = body.commitHash ? String(body.commitHash).slice(0, 64) : "";
  const environment = body.environment ? String(body.environment).slice(0, 64) : "production";

  try {
    await saveDeploymentHistory({
      projectKey: PROJECT_KEY,
      commitHash,
      environment,
      status,
      summary,
      metadata: body.metadata && typeof body.metadata === "object" ? body.metadata : {},
    });
    return res.status(204).end();
  } catch (e) {
    console.error("deployment-report:", e);
    return res.status(500).json({ error: "Failed to record deployment" });
  }
}
