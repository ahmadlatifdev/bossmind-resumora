#!/usr/bin/env node
/**
 * BossMind → Recovery → Stripe Session Repair
 *
 *   npm run bossmind:stripe:session-repair              # detect only
 *   npm run bossmind:stripe:session-repair -- --apply   # purge Stripe session + verify
 *   npm run bossmind:stripe:dashboard-repair:apply
 *   npm run bossmind:stripe:dashboard-repair -- --apply --profile=Default
 *   npm run bossmind:stripe:health
 */
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

const require = createRequire(import.meta.url);
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

function arg(name, fallback = "") {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(`--${name}=`.length) : fallback;
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

async function main() {
  require(path.join(root, "lib/shared/load-project-env.js")).loadProjectEnv(root);

  const { runStripeSessionRecovery } = require(path.join(
    root,
    "lib/orchestration/bossmind-stripe-session-recovery.js"
  ));

  const apply = hasFlag("apply");
  const profile = arg("profile", "");
  const skipPersist = hasFlag("no-persist");
  const healthOnly = hasFlag("health");

  if (healthOnly) {
    const { verifyStripeDashboardHealth } = require(path.join(
      root,
      "lib/orchestration/bossmind-stripe-session-recovery.js"
    ));
    const health = await verifyStripeDashboardHealth({ cwd: root });
    console.log(JSON.stringify(health, null, 2));
    process.exit(health.healthy ? 0 : 1);
  }

  const report = await runStripeSessionRecovery({
    cwd: root,
    projectKey: arg("project", process.env.BOSSMIND_PROJECT_KEY || "resumora"),
    apply,
    profile,
    verify: true,
    persist: !skipPersist,
    launchIsolated: !hasFlag("no-isolated-launch"),
    writerAgent: "recovery_agent",
  });

  console.log(JSON.stringify(report, null, 2));

  if (apply && report.repair?.report?.chromeRunning) {
    process.exit(2);
  }
  process.exit(report.ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
