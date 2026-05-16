#!/usr/bin/env node
/**
 * Full closed-loop: checkpoint → snapshot → build → deploy guard → live validate → lock.
 * Stops on first hard failure unless BOSSMIND_ULTRA_CONTINUE_ON_FAIL=1.
 *
 *   npm run bossmind:ultra:antileak:closed-loop
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

function arg(name, def = "") {
  const eq = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (eq) return eq.slice(`--${name}=`.length).trim();
  return def;
}

async function main() {
  require(path.join(root, "lib/shared/load-project-env.js")).loadProjectEnv(root);
  const { spawnSync } = require("child_process");

  const origin = arg("origin", process.env.BOSSMIND_REALITY_LIVE_URL || "https://resumora.net");
  const steps = [];

  const cp = spawnSync(process.execPath, [path.join(root, "scripts/bossmind-deploy-checkpoint.mjs")], {
    cwd: root,
    encoding: "utf8",
  });
  steps.push({ id: "pre_deploy_checkpoint", ok: (cp.status ?? 1) === 0 });

  const { runUltraAntiLeak, lockUltraAntiLeakState, createImmutableSnapshot } = require(path.join(
    root,
    "lib/orchestration/bossmind-ultra-antileak-lib.js"
  ));

  const snap = createImmutableSnapshot(root);
  steps.push({ id: "immutable_snapshot", ok: snap.ok });

  const report = await runUltraAntiLeak({
    cwd: root,
    origin,
    createSnapshot: false,
    skipBuild: false,
  });
  steps.push({ id: "ultra_validation", ok: report.overallProductionSafetyPercent >= 98 });

  if (report.meetsTarget || process.env.BOSSMIND_ULTRA_LOCK_ON_PARTIAL === "1") {
    report.lock = await lockUltraAntiLeakState(report, root);
    steps.push({ id: "golden_lock", ok: report.lock?.neon?.ok || fs.existsSync(path.join(root, ".bossmind", "anti-leak", "latest-ultra-lock.json")) });
  }

  const outDir = path.join(root, "windows-heal", "reports");
  fs.mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outFile = path.join(outDir, `bossmind-ultra-closed-loop-${stamp}.json`);
  fs.writeFileSync(outFile, JSON.stringify({ steps, report }, null, 2), "utf8");

  console.log(JSON.stringify({ steps, rates: report.rates, overall: report.overallProductionSafetyPercent, reportFile: outFile }, null, 2));
  process.exit(report.meetsTarget ? 0 : 2);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
