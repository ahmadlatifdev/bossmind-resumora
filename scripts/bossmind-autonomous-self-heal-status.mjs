#!/usr/bin/env node
/**
 * Proof-based report: autonomous self-heal / closed-loop readiness (read-only).
 *
 *   npm run bossmind:autonomous:self-heal:status
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

function main() {
  require(path.join(root, "lib/shared/load-project-env.js")).loadProjectEnv(root);
  const { getAutonomousSelfHealStatus } = require(path.join(
    root,
    "lib/orchestration/bossmind-autonomous-self-heal-status.js"
  ));
  const report = getAutonomousSelfHealStatus();
  const policyPath = path.join(root, "config", "bossmind-autonomous-self-heal-policy.json");
  report.policySha256 = fs.existsSync(policyPath)
    ? crypto.createHash("sha256").update(fs.readFileSync(policyPath, "utf8")).digest("hex")
    : null;

  const outDir = path.join(root, "windows-heal", "reports");
  fs.mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outFile = path.join(outDir, `bossmind-autonomous-self-heal-status-${stamp}.json`);
  fs.writeFileSync(outFile, JSON.stringify(report, null, 2), "utf8");
  report.reportFile = outFile.replace(/\\/g, "/");
  console.log(JSON.stringify(report, null, 2));
}

main();
