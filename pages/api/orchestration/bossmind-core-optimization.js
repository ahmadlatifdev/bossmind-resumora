/**
 * BossMind Core Optimization API — read latest report or trigger run.
 * GET: latest report | POST: run optimization (Bearer BOSSMIND_ORCHESTRATION_SECRET)
 */
const {
  runBossMindCoreOptimization,
  readLatestCoreOptimizationReport,
} = require("../../../lib/orchestration/bossmind-core-optimization-lib");

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
    return res.status(401).json({ error: "Unauthorized" });
  }

  if (req.method === "GET") {
    const latest = readLatestCoreOptimizationReport(process.cwd());
    return res.status(200).json({
      ok: Boolean(latest),
      latest,
      runCommand: "npm run bossmind:core:optimization",
      dashboardPath: "/bossmind-admin",
    });
  }

  if (req.method === "POST") {
    try {
      const neon = require("../../../lib/shared/neon-memory.js");
      const skipLive = req.query?.skipLive === "1" || req.body?.skipLive === true;
      const report = await runBossMindCoreOptimization({
        cwd: process.cwd(),
        neonApi: neon,
        projectKey: process.env.BOSSMIND_PROJECT_KEY || "resumora",
        skipLiveProbe: skipLive,
        skipBuild: true,
        writeReport: true,
      });
      return res.status(report.meetsTarget ? 200 : 207).json(report);
    } catch (e) {
      return res.status(500).json({ error: e.message || "Core optimization failed" });
    }
  }

  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ error: "Method not allowed" });
}
