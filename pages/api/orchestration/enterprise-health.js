require("../../../lib/shared/ensure-project-env");
const { runRuntimeStabilityProbe } = require("../../../lib/orchestration/bossmind-runtime-stability-engine");
const { loadConfig } = require("../../../lib/orchestration/bossmind-enterprise-stabilization-cycle");

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const cwd = process.cwd();
  const cfg = loadConfig(cwd);
  const origin =
    String(req.query.origin || process.env.BOSSMIND_REALITY_LIVE_URL || cfg.primaryOrigin).replace(
      /\/$/,
      ""
    );

  try {
    const stability = await runRuntimeStabilityProbe({ cwd, origin, cfg });
    let latestCycle = null;
    try {
      const fs = require("fs");
      const p = require("path").join(cwd, ".bossmind/enterprise-stabilization/latest.json");
      if (fs.existsSync(p)) latestCycle = JSON.parse(fs.readFileSync(p, "utf8"));
    } catch {
      /* ignore */
    }

    return res.status(200).json({
      ok: !stability.blockDeploy && !stability.loopDetected,
      origin,
      stability,
      latestEnterpriseCycle: latestCycle
        ? {
            ok: latestCycle.ok,
            completedAt: latestCycle.completedAt,
            criticalJourneyOk: latestCycle.criticalJourneyOk,
          }
        : null,
      ts: Date.now(),
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
}
