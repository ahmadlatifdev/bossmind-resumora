#!/usr/bin/env node
/**
 * BossMind luxury UI baseline gate (Detect → Validate → report).
 * Does not modify files. Requires git for HEAD echo + optional tag suggestion.
 *
 * Steps: production build + protected surface verify + anti-leak + HEAD summary.
 * Optional live probes: start dev server then BOSSMIND_PROBE_ORIGIN=http://127.0.0.1:3001 npm run bossmind:ui-probe
 */
import { spawnSync } from "child_process";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function gitExe() {
  return process.env.BOSSMIND_GIT_EXE || "git";
}

function head() {
  const r = spawnSync(gitExe(), ["rev-parse", "HEAD"], {
    cwd: root,
    encoding: "utf8",
  });
  return r.stdout?.trim() || "(unknown)";
}

function branch() {
  const r = spawnSync(gitExe(), ["rev-parse", "--abbrev-ref", "HEAD"], {
    cwd: root,
    encoding: "utf8",
  });
  return r.stdout?.trim() || "(unknown)";
}

function npmRun(script) {
  const isWin = process.platform === "win32";
  const r = spawnSync(isWin ? "npm.cmd" : "npm", ["run", script], {
    cwd: root,
    stdio: "inherit",
    shell: isWin,
  });
  return r.status === 0;
}

console.log("\n=== BossMind UI baseline verify ===\n");
console.log(`Git HEAD: ${head()}`);
console.log(`Branch:   ${branch()}\n`);

const steps = [
  ["bossmind:immutable:verify", "sealed luxury + full-workspace checksums (BOSSMIND_BASELINE_OVERRIDE=1 to approve drift)"],
  ["build", "next build (production CSS/JS bundle)"],
  ["bossmind:protect:verify", "locked routes + shell files exist"],
  ["bossmind:antileak", "anti-leak vs origin/main (set BOSSMIND_PROTECTED_EDIT_OK=1 to bypass)"],
];

for (const [script, label] of steps) {
  console.log(`→ ${label}`);
  if (!npmRun(script)) {
    console.error(`\nbossmind-ui-baseline-verify: FAILED at npm run ${script}`);
    process.exit(1);
  }
}

console.log("\n=== OK — luxury UI baseline gate passed ===");
console.log("Active styling: styles/resumora-global.css (navy/gold tokens, .rs-* components)");
console.log("Shell: components/marketing/SiteChrome.js · Pricing: components/marketing/sections/PricingPanel.jsx");
console.log("i18n: context/LanguageContext.js + lib/marketing/site-copy.js");
console.log("\nOptional live HTML probes (dev server on PORT 3001):");
console.log("  npm run dev:plain   # then in another terminal:");
console.log("  npm run bossmind:ui-probe");
console.log("\nRollback snapshot tag:");
console.log(`  npm run bossmind:snapshot -- ui-baseline-${head().slice(0, 7)}`);
console.log("");
process.exit(0);
