#!/usr/bin/env node
/**
 * BossMind Ultra Anti-Leak — closed-loop production deployment safety (proof-based %).
 *
 *   npm run bossmind:ultra:antileak
 *   npm run bossmind:ultra:antileak -- --snapshot --lock
 *   npm run bossmind:ultra:antileak -- --origin=https://resumora.net --skip-build
 *   npm run bossmind:ultra:antileak -- --self-heal
 */
import fs from "node:fs";
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
  try {
    require(path.join(root, "lib/shared/load-project-env.js")).loadProjectEnv(root);
  } catch {
    /* optional */
  }

  if (hasFlag("snapshot")) {
    const cp = spawnCheckpoint();
    if (!cp.ok) process.exit(cp.code || 1);
  }

  const { runUltraAntiLeak, lockUltraAntiLeakState } = require(path.join(
    root,
    "lib/orchestration/bossmind-ultra-antileak-lib.js"
  ));

  const report = await runUltraAntiLeak({
    cwd: root,
    origin: arg("origin", process.env.BOSSMIND_REALITY_LIVE_URL || ""),
    skipBuild: hasFlag("skip-build") || process.env.BOSSMIND_ULTRA_SKIP_BUILD === "1",
    createSnapshot: hasFlag("snapshot"),
    selfHeal: hasFlag("self-heal"),
    restoreGolden: hasFlag("restore-golden"),
  });

  const outDir = path.join(root, "windows-heal", "reports");
  fs.mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outFile = path.join(outDir, `bossmind-ultra-antileak-${stamp}.json`);
  fs.writeFileSync(outFile, JSON.stringify(report, null, 2), "utf8");
  report.reportFile = outFile.replace(/\\/g, "/");

  if (hasFlag("lock")) {
    report.lock = await lockUltraAntiLeakState(report, root);
  }

  console.log(JSON.stringify(report, null, 2));
  process.exit(report.meetsTarget ? 0 : 2);
}

function spawnCheckpoint() {
  const { spawnSync } = require("child_process");
  const res = spawnSync(process.execPath, [path.join(root, "scripts/bossmind-deploy-checkpoint.mjs")], {
    cwd: root,
    encoding: "utf8",
  });
  return { ok: (res.status ?? 1) === 0, code: res.status ?? 1 };
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
