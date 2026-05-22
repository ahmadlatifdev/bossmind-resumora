require("../../../lib/shared/ensure-project-env");
const { loadGovernanceBundle, runProductionGovernanceCheck } = require("../../../lib/orchestration/bossmind-production-governance");
const { runRuntimeImmunityAudit } = require("../../../lib/orchestration/bossmind-runtime-immunity");
const { getOrchestrationIntelligence } = require("../../../lib/orchestration/bossmind-orchestration-memory-hub");
const fs = require("fs");
const path = require("path");

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const cwd = process.cwd();
  const origin = String(req.query.origin || process.env.BOSSMIND_REALITY_LIVE_URL || "https://www.resumora.net").replace(
    /\/$/,
    ""
  );

  try {
    const bundle = loadGovernanceBundle(cwd);
    const governance = await runProductionGovernanceCheck({ cwd, origin });
    const immunity = await runRuntimeImmunityAudit({ cwd, origin });
    const intelligence = getOrchestrationIntelligence(cwd);

    let lastCycle = null;
    let lastClosedLoop = null;
    const govDir = path.join(cwd, ".bossmind/governance");
    for (const [key, file] of [
      ["lastEnterpriseCycle", "last-enterprise-cycle.json"],
      ["lastClosedLoop", "last-closed-loop.json"],
    ]) {
      const p = path.join(govDir, file);
      if (fs.existsSync(p)) {
        try {
          if (key === "lastEnterpriseCycle") lastCycle = JSON.parse(fs.readFileSync(p, "utf8"));
          else lastClosedLoop = JSON.parse(fs.readFileSync(p, "utf8"));
        } catch {
          /* ignore */
        }
      }
    }

    return res.status(200).json({
      ok: governance.blockDeploy !== true && immunity.immune === true,
      origin,
      productionLock: bundle.productionLock,
      stableRelease: bundle.stableRelease,
      deploymentState: bundle.deploymentState,
      governance,
      immunity,
      intelligence,
      lastEnterpriseCycle: lastCycle
        ? { ok: lastCycle.ok, completedAt: lastCycle.completedAt }
        : null,
      lastClosedLoop: lastClosedLoop
        ? { ok: lastClosedLoop.ok, failedStage: lastClosedLoop.failedStage, completedAt: lastClosedLoop.completedAt }
        : null,
      ts: Date.now(),
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
}
