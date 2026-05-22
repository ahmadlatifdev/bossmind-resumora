#!/usr/bin/env node
/**
 * Enterprise-grade BossMind + Resumora stabilization cycle.
 *   npm run bossmind:enterprise:stabilization
 */
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

const require = createRequire(import.meta.url);
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
require(path.join(root, "lib/shared/load-project-env.js")).loadProjectEnv(root);

const { runEnterpriseStabilizationCycle } = require(path.join(
  root,
  "lib/orchestration/bossmind-enterprise-stabilization-cycle.js"
));

const skipBuild = process.argv.includes("--skip-build");
const skipRepair = process.argv.includes("--skip-repair");

async function main() {
  let neon = null;
  try {
    neon = require(path.join(root, "lib/shared/neon-memory.js"));
    if (neon?.ensureEngagementSchema) await neon.ensureEngagementSchema();
  } catch {
    neon = null;
  }

  const report = await runEnterpriseStabilizationCycle({
    cwd: root,
    neonApi: neon?.enabled ? neon : null,
    skipBuild,
    skipRepair,
    allowGitPush: process.env.BOSSMIND_CHAIN_ALLOW_GIT_PUSH === "1",
  });

  console.log(JSON.stringify(report, null, 2));
  process.exit(report.ok ? 0 : 2);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
