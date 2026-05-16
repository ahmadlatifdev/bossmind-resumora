#!/usr/bin/env node
/**
 * Lock Google Traffic Engine state to Neon (requires --i-understand-traffic-config).
 *
 *   npm run resumora:google-traffic:lock -- --i-understand-traffic-config --notes="verified"
 */
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

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

async function main() {
  if (!hasFlag("i-understand-traffic-config")) {
    console.error("Refusing lock without --i-understand-traffic-config");
    process.exit(2);
  }

  require(path.join(root, "lib/shared/load-project-env.js")).loadProjectEnv(root);
  const { runGoogleTrafficEngine, lockGoogleTrafficEngineToNeon } = require(path.join(
    root,
    "lib/marketing/resumora-google-traffic-engine-lib.js"
  ));

  const report = await runGoogleTrafficEngine({ root, skipAi: true });
  const lock = await lockGoogleTrafficEngineToNeon(report, { notes: arg("notes", "") });
  console.log(JSON.stringify({ lock, validation: report.validation, scores: report.integrationScores }, null, 2));
  process.exit(lock.ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
