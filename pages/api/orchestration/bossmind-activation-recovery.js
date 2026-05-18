/**
 * BossMind activation recovery API — scan all projects, optional safe fixes.
 * GET: scan · POST: scan + applySafe + optional lock (Bearer BOSSMIND_ORCHESTRATION_SECRET)
 */
const { runActivationRecovery } = require("../../../lib/orchestration/bossmind-activation-recovery-engine");

function authorize(req) {
  const dev = process.env.NODE_ENV === "development";
  const diag = process.env.BOSSMIND_DIAGNOSTICS === "1";
  const secret = process.env.BOSSMIND_ORCHESTRATION_SECRET;
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  return dev || diag || (Boolean(secret) && token === secret);
}

export default async function handler(req, res) {
  if (!authorize(req)) {
    return res.status(401).json({ error: "unauthorized" });
  }

  const writerAgent =
    req.headers["x-bossmind-writer-agent"] || req.body?.writerAgent || "recovery_agent";

  if (req.method === "GET" || req.method === "POST") {
    try {
      const applySafe = req.method === "POST" && Boolean(req.body?.applySafe);
      const lock =
        req.method === "POST" &&
        Boolean(req.body?.lock) &&
        req.body?.confirm === "i-understand-production";
      const report = await runActivationRecovery({
        writerAgent,
        applySafe,
        liveProbe: req.body?.liveProbe !== false,
        lock,
        notes: String(req.body?.notes || "api_scan").slice(0, 2000),
      });
      return res.status(report.ok ? 200 : 207).json({ ok: report.ok, ...report });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e.message || "scan_failed" });
    }
  }

  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ error: "Method not allowed" });
}
