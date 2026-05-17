#!/usr/bin/env node
/**
 * Mandatory post-deploy validation — runs after every deploy when hooked.
 *   npm run bossmind:production:post-deploy-validation
 */
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";

const require = createRequire(import.meta.url);
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const { runAutonomousValidationEngine } = require(path.join(
  root,
  "lib/orchestration/bossmind-autonomous-validation-engine.js"
));
const { runPredictivePreventionEngine } = require(path.join(
  root,
  "lib/orchestration/bossmind-predictive-prevention-engine.js"
));

const origin =
  process.env.BOSSMIND_COMPLETION_PROBE_ORIGIN ||
  process.env.BOSSMIND_REALITY_LIVE_URL ||
  "https://resumora.net";

async function main() {
  const predictive = await runPredictivePreventionEngine({ cwd: root });
  if (predictive.blockDeploy && process.env.BOSSMIND_PREDICTIVE_BLOCK_DEPLOY === "1") {
    console.error(JSON.stringify({ error: "Pre-deploy predictive block", predictive }, null, 2));
    process.exit(3);
  }

  const validation = await runAutonomousValidationEngine({ cwd: root, origin });
  const report = {
    generatedAt: new Date().toISOString(),
    origin,
    predictive,
    validation,
    pass: validation.percent >= 70 && !validation.blockDeploy,
  };

  const outDir = path.join(root, ".bossmind", "validation");
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "latest-post-deploy.json"), JSON.stringify(report, null, 2), "utf8");

  console.log(JSON.stringify(report, null, 2));
  process.exit(report.pass ? 0 : 2);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
