#!/usr/bin/env node
/**
 * BossMind task completion / production-readiness gate (repo-enforced).
 *
 * Runs local + artifact checks so merges and deploys are not "done" on logic alone.
 * Does NOT auto-deploy, auto-repair production hosts, or mutate git — those stay in Render/Railway/CI + human approval.
 *
 * Order:
 *   1) Forbidden public UI patterns (marketing source)
 *   2) Hosting policy
 *   3) Protected surface registry
 *   4) Anti-leak (unless BOSSMIND_SKIP_ANTILEAK=1)
 *   5) Lint (unless BOSSMIND_COMPLETION_SKIP_LINT=1)
 *   6) next build
 *   7) Immutable baseline verify (unless BOSSMIND_COMPLETION_SKIP_IMMUTABLE=1)
 *   8) Optional live HTML probe (requires explicit flag + origin)
 *
 * Optional live production homepage check (positive markers for trust footer v2):
 *   BOSSMIND_COMPLETION_LIVE_PROBE=1
 *   BOSSMIND_COMPLETION_PROBE_ORIGIN=https://resumora.net
 *     (falls back to BOSSMIND_IMMUTABLE_PROBE_ORIGIN if unset)
 */
import { spawnSync } from "node:child_process";
import https from "node:https";
import http from "node:http";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const isWin = process.platform === "win32";
const npm = isWin ? "npm.cmd" : "npm";

function run(label, cmd, args, extraEnv = {}) {
  console.log(`\n→ ${label}`);
  const r = spawnSync(cmd, args, {
    cwd: root,
    shell: true,
    stdio: "inherit",
    env: { ...process.env, ...extraEnv },
  });
  if ((r.status ?? 1) !== 0) {
    console.error(`bossmind-task-completion-gate: FAILED at ${label}`);
    process.exit(r.status ?? 1);
  }
}

function fetchText(urlString, timeoutMs = 20000) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlString);
    const lib = u.protocol === "https:" ? https : http;
    const req = lib.request(
      urlString,
      {
        method: "GET",
        timeout: timeoutMs,
        headers: { "user-agent": "BossMind-task-completion-gate/1.1", "accept-language": "en,fr" },
      },
      (res) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (c) => {
          body += c;
          if (body.length > 2_000_000) req.destroy(new Error("response too large"));
        });
        res.on("end", () => resolve({ status: res.statusCode || 0, body }));
      }
    );
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", reject);
    req.end();
  });
}

async function liveHomeProbe() {
  if (process.env.BOSSMIND_COMPLETION_LIVE_PROBE !== "1") {
    console.log("\n→ Live production homepage probe: skipped (set BOSSMIND_COMPLETION_LIVE_PROBE=1 to enable)");
    return;
  }
  const raw =
    process.env.BOSSMIND_COMPLETION_PROBE_ORIGIN ||
    process.env.BOSSMIND_IMMUTABLE_PROBE_ORIGIN ||
    "";
  const origin = String(raw).replace(/\/$/, "");
  if (!/^https:\/\//i.test(origin)) {
    console.error(
      "bossmind-task-completion-gate: BOSSMIND_COMPLETION_LIVE_PROBE=1 requires BOSSMIND_COMPLETION_PROBE_ORIGIN or BOSSMIND_IMMUTABLE_PROBE_ORIGIN (https://…)"
    );
    process.exit(1);
  }
  console.log(`\n→ Live production homepage probe (${origin}/)`);
  const required = [
    'id="top"',
    'id="trust"',
    'id="home-intake"',
    'id="pricing"',
    "rs-footer-engage-dock",
    'id="footer-official-social"',
  ];
  try {
    const r = await fetchText(`${origin}/`);
    if (r.status !== 200) {
      console.error(`bossmind-task-completion-gate: live probe HTTP ${r.status}`);
      process.exit(1);
    }
    const missing = required.filter((s) => !r.body.includes(s));
    if (missing.length) {
      console.error(
        "bossmind-task-completion-gate: live homepage missing expected markers (stale deploy or wrong origin):"
      );
      for (const m of missing) console.error(`  - ${m}`);
      process.exit(1);
    }
    const { assertApprovedFooterInHtml } = require(join(root, "lib/orchestration/bossmind-footer-live-drift.js"));
    const drift = assertApprovedFooterInHtml(r.body);
    if (!drift.ok) {
      console.error("bossmind-task-completion-gate: LIVE FOOTER DRIFT — production still serving pre-cleanup footer or incomplete HTML.");
      if (drift.violations?.length) console.error("  forbidden (stale):", drift.violations.join(", "));
      if (drift.missing?.length) console.error("  missing (new baseline):", drift.missing.join(", "));
      console.error("  Fix: redeploy Render from latest main, clear build cache, purge CDN if any.");
      process.exit(1);
    }
    console.log("  live homepage markers + footer anti-drift: OK");
  } catch (e) {
    console.error("bossmind-task-completion-gate: live probe error:", e?.message || e);
    process.exit(1);
  }
}

run("Forbidden public UI pattern scan (marketing)", "node", ["scripts/bossmind-public-ui-forbidden-scan.mjs"]);
run("Hosting policy (no Vercel)", "node", ["scripts/bossmind-hosting-guard.mjs"]);
run("Protected surface registry", "node", ["scripts/bossmind-protected-surface-verify.mjs"]);

if (process.env.BOSSMIND_SKIP_ANTILEAK !== "1") {
  run("Anti-leak guard", "node", ["scripts/bossmind-antileak-guard.mjs"]);
}

if (process.env.BOSSMIND_COMPLETION_SKIP_LINT !== "1") {
  run("ESLint", npm, ["run", "lint"]);
}

run("Production build", npm, ["run", "build"]);

if (process.env.BOSSMIND_COMPLETION_SKIP_IMMUTABLE !== "1") {
  const probeEnv =
    process.env.BOSSMIND_IMMUTABLE_PROBE_ORIGIN ||
    process.env.BOSSMIND_PRODUCTION_PUBLIC_ORIGIN ||
    "";
  run(
    "Immutable luxury baseline verify",
    "node",
    ["scripts/bossmind-immutable-verify.mjs"],
    probeEnv ? { BOSSMIND_IMMUTABLE_PROBE_ORIGIN: probeEnv } : {}
  );
} else {
  console.log("\n→ Immutable verify: skipped (BOSSMIND_COMPLETION_SKIP_IMMUTABLE=1 — emergency only)");
}

await liveHomeProbe();

console.log(
  "\nbossmind-task-completion-gate: OK — repo validation passed. Deploy to Render/Railway and re-run with BOSSMIND_COMPLETION_LIVE_PROBE=1 to confirm production HTML."
);
process.exit(0);
