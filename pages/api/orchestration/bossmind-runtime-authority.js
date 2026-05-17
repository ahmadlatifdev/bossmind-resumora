/**
 * BossMind Global Runtime Authority API
 * GET: status | POST: run closed-loop cycle (orchestrator write)
 */
const {
  runRuntimeAuthorityCycle,
  getRuntimeAuthorityStatus,
  injectRuntimeContext,
} = require("../../../lib/orchestration/bossmind-runtime-authority-engine");

function authorize(req, requireWrite = false) {
  const dev = process.env.NODE_ENV === "development";
  const diag = process.env.BOSSMIND_DIAGNOSTICS === "1";
  const secret = process.env.BOSSMIND_ORCHESTRATION_SECRET;
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  const ok = dev || diag || (Boolean(secret) && token === secret);
  if (!ok) return { ok: false };
  const writerAgent = req.headers["x-bossmind-writer-agent"] || req.body?.writerAgent || "read_only";
  if (requireWrite && writerAgent !== "bossmind_orchestrator" && writerAgent !== "master_admin_shortcut" && !dev && !diag) {
    return { ok: false, reason: "write_agent_not_approved" };
  }
  return { ok: true, writerAgent: writerAgent || "bossmind_orchestrator" };
}

export default async function handler(req, res) {
  if (req.method === "GET") {
    const auth = authorize(req, false);
    if (!auth.ok) return res.status(401).json({ error: "Unauthorized" });
    const action = req.query?.action || "status";
    try {
      if (action === "context") {
        const projectKey = req.query?.projectKey || "resumora";
        const ctx = await injectRuntimeContext(projectKey);
        return res.status(200).json(ctx);
      }
      const status = await getRuntimeAuthorityStatus(process.cwd());
      return res.status(200).json(status);
    } catch (e) {
      return res.status(500).json({ error: e.message || "Runtime authority read failed" });
    }
  }

  if (req.method === "POST") {
    const auth = authorize(req, true);
    if (!auth.ok) {
      return res.status(auth.reason ? 403 : 401).json({ error: auth.reason || "Unauthorized" });
    }
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
    const projectKey = body.projectKey || req.query?.projectKey || "resumora";
    try {
      const report = await runRuntimeAuthorityCycle({
        projectKey,
        origin: body.origin || process.env.BOSSMIND_IMMUTABLE_PROBE_ORIGIN,
        writerAgent: auth.writerAgent,
        captureScreenshot: body.captureScreenshot !== false,
        allProjects: Boolean(body.allProjects),
      });
      return res.status(report.ok ? 200 : 207).json(report);
    } catch (e) {
      return res.status(500).json({ error: e.message || "Runtime authority cycle failed" });
    }
  }

  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ error: "Method not allowed" });
}
