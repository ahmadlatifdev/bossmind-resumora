#!/usr/bin/env node
/**
 * Runtime self-heal: cache purge → optional golden restore → runtime-sync → re-validate.
 *
 *   npm run bossmind:ultra:antileak:self-heal
 *   npm run bossmind:ultra:antileak:self-heal -- --restore-golden
 */
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

function arg(name, def = "") {
  const eq = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (eq) return eq.slice(`--${name}=`.length).trim();
  return def;
}

async function main() {
  require(path.join(root, "lib/shared/load-project-env.js")).loadProjectEnv(root);
  const { runSelfHealPipeline, runUltraAntiLeak } = require(path.join(
    root,
    "lib/orchestration/bossmind-ultra-antileak-lib.js"
  ));

  const origin = arg("origin", process.env.BOSSMIND_REALITY_LIVE_URL || "https://resumora.net");
  const heal = await runSelfHealPipeline(root, origin, { restoreSnapshot: hasFlag("restore-golden") });
  const report = await runUltraAntiLeak({ cwd: root, origin, skipBuild: true });

  console.log(JSON.stringify({ heal, validation: report.rates, overall: report.overallProductionSafetyPercent }, null, 2));
  process.exit(heal.ok && report.overallProductionSafetyPercent >= 70 ? 0 : 2);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
