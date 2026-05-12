#!/usr/bin/env node
/**
 * Honest heuristic risk score (0–100) from local runtime artifacts — not ML.
 * Higher = more caution before deploy or heavier healing.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const syncStatus = path.join(root, ".bossmind", "runtime-sync", "status.json");
const autoHistory = path.join(root, ".bossmind", "autonomous-runtime", "history.jsonl");

function readJsonSafe(p) {
  try {
    if (!fs.existsSync(p)) return null;
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return null;
  }
}

function tailDegradedCount(lines, max = 8) {
  let n = 0;
  const slice = lines.slice(-max);
  for (const line of slice) {
    try {
      const j = JSON.parse(line);
      if (j.degraded) n += 1;
    } catch {
      /* ignore */
    }
  }
  return n;
}

function main() {
  let risk = 15;
  const factors = [];

  const sync = readJsonSafe(syncStatus);
  if (sync?.hasDrift) {
    risk += 35;
    factors.push("runtime_sync_hasDrift");
  }
  const autonomy = Number(sync?.scores?.compositeAutonomyScore ?? NaN);
  if (!Number.isNaN(autonomy) && autonomy < 55) {
    risk += 20;
    factors.push("low_composite_autonomy_score");
  }

  if (fs.existsSync(autoHistory)) {
    const lines = fs.readFileSync(autoHistory, "utf8").trim().split("\n").filter(Boolean);
    const deg = tailDegradedCount(lines, 10);
    if (deg >= 4) {
      risk += 25;
      factors.push("recent_autonomous_degraded_runs");
    } else if (deg >= 2) {
      risk += 12;
      factors.push("some_recent_degraded_runs");
    }
  }

  risk = Math.min(100, Math.max(0, Math.round(risk)));

  const blockDeploy = risk >= 75 && process.env.BOSSMIND_RISK_BLOCK_DEPLOY === "1";
  const out = {
    riskScore: risk,
    factors,
    recommendation:
      risk >= 70
        ? "run_runtime_sync_and_deploy_gate_before_deploy"
        : risk >= 45
          ? "monitor_and_reconcile"
          : "within_normal_band",
    blockDeploySuggested: risk >= 75,
    blockDeployEnforced: blockDeploy,
  };
  console.log(JSON.stringify(out, null, 2));
  process.exit(blockDeploy ? 2 : 0);
}

main();
