#!/usr/bin/env node
/**
 * BossMind Missing/Partial Activation Auto-Recovery (all projects).
 *
 *   npm run bossmind:activation:recover
 *   npm run bossmind:activation:recover -- --apply-safe
 *   node scripts/bossmind-activation-recovery.mjs --lock --i-understand-production --notes="..."
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

function hasFlag(n) {
  return process.argv.includes(`--${n}`);
}
function arg(name, def = "") {
  const eq = process.argv.find((a) => a.startsWith(`--${name}=`));
  return eq ? eq.slice(name.length + 3) : def;
}

async function main() {
  if (hasFlag("lock") && !hasFlag("i-understand-production")) {
    console.error("Refusing lock without --i-understand-production");
    process.exit(1);
  }

  require(path.join(root, "lib/shared/load-project-env.js")).loadProjectEnv(root);
  const { runActivationRecovery } = require(path.join(
    root,
    "lib/orchestration/bossmind-activation-recovery-engine.js"
  ));

  const report = await runActivationRecovery({
    writerAgent: "recovery_agent",
    applySafe: hasFlag("apply-safe"),
    liveProbe: !hasFlag("no-live"),
    lock: hasFlag("lock"),
    notes: arg("notes", "activation_recovery_scan"),
  });

  const reportsDir = path.join(root, "windows-heal/reports");
  fs.mkdirSync(reportsDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const reportPath = path.join(reportsDir, `activation-recovery-${stamp}.json`);
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  fs.writeFileSync(
    path.join(root, "config/bossmind-activation-recovery-lock.json"),
    JSON.stringify(
      {
        version: 1,
        generatedAt: report.generatedAt,
        overallHealthScore: report.overallHealthScore,
        projects: report.projects?.map((p) => ({
          id: p.projectId,
          healthScore: p.healthScore,
          broken: p.features?.filter((f) => f.status === "BROKEN").length,
        })),
        escalationCount: report.escalation?.length ?? 0,
      },
      null,
      2
    )
  );

  console.log(JSON.stringify({ ...report, reportPath }, null, 2));
  process.exit(report.ok ? 0 : 2);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
