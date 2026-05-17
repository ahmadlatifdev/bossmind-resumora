#!/usr/bin/env node
/**
 * Run a Master Admin shared-memory shortcut from CLI.
 * Usage: npm run bossmind:shared-memory:shortcut -- --project=resumora --shortcut=verify_live [--dry-run]
 */
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const { runShortcut, SHORTCUTS } = require("../lib/orchestration/bossmind-shared-memory-hub.js");

function arg(name, fallback) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split("=").slice(1).join("=") : fallback;
}

async function main() {
  const projectKey = arg("project", process.env.BOSSMIND_PROJECT_KEY || "resumora");
  const shortcutId = arg("shortcut", "");
  const dryRun = process.argv.includes("--dry-run");

  if (!shortcutId) {
    console.log(JSON.stringify({ shortcuts: SHORTCUTS.map((s) => s.id) }, null, 2));
    process.exit(0);
  }

  const out = await runShortcut(shortcutId, {
    projectKey,
    writerAgent: "bossmind_orchestrator",
    dryRun,
  });
  console.log(JSON.stringify(out, null, 2));
  process.exit(out.ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
