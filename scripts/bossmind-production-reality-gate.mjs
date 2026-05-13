#!/usr/bin/env node
/**
 * Production "reality" gate — repo + optional live checks. Does NOT auto-patch or auto-redeploy.
 *
 *   npm run bossmind:reality:gate
 *
 * Steps:
 *   1) Production build (skip with BOSSMIND_REALITY_SKIP_BUILD=1)
 *   2) Locked production verify (checksums + structural authority; pass BOSSMIND_IMMUTABLE_PROBE_ORIGIN for live markers)
 *   3) Optional: BOSSMIND_REALITY_LIVE_URL=https://resumora.net — GET / + footer anti-drift + GET /api/health
 *   4) Optional: BOSSMIND_CLOSED_LOOP_RECORD=1 + --task-id via env BOSSMIND_CLOSED_LOOP_TASK_ID — runs bossmind-closed-loop-record.mjs
 */
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import https from "node:https";
import http from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const isWin = process.platform === "win32";
const npm = isWin ? "npm.cmd" : "npm";

const { assertApprovedFooterInHtml } = require(join(root, "lib/orchestration/bossmind-footer-live-drift.js"));

function run(label, cmd, args, extraEnv = {}) {
  console.log(`\n→ ${label}`);
  const r = spawnSync(cmd, args, {
    cwd: root,
    shell: true,
    stdio: "inherit",
    env: { ...process.env, ...extraEnv },
  });
  if ((r.status ?? 1) !== 0) {
    console.error(`bossmind-production-reality-gate: FAILED at ${label}`);
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
        headers: { "user-agent": "BossMind-reality-gate/1.0", "accept-language": "en,fr" },
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

async function liveChecks() {
  const base = (process.env.BOSSMIND_REALITY_LIVE_URL || "").replace(/\/$/, "");
  if (!base) {
    console.log("\n→ Live URL checks: skipped (set BOSSMIND_REALITY_LIVE_URL=https://resumora.net)");
    return;
  }
  if (!/^https:\/\//i.test(base)) {
    console.error("bossmind-production-reality-gate: BOSSMIND_REALITY_LIVE_URL must be https://…");
    process.exit(1);
  }
  console.log(`\n→ Live URL checks (${base})`);
  const home = await fetchText(`${base}/`);
  if (home.status !== 200) {
    console.error(`bossmind-production-reality-gate: home HTTP ${home.status}`);
    process.exit(1);
  }
  const drift = assertApprovedFooterInHtml(home.body);
  if (!drift.ok) {
    console.error("bossmind-production-reality-gate: LIVE FOOTER / layout drift detected.");
    if (drift.violations?.length) console.error("  stale / forbidden:", drift.violations.join(", "));
    if (drift.missing?.length) console.error("  missing baseline:", drift.missing.join(", "));
    console.error("  Redeploy latest main on Render (clear build cache), then re-run this gate.");
    process.exit(1);
  }
  const health = await fetchText(`${base}/api/health`);
  if (health.status !== 200 || !health.body.includes('"ok":true')) {
    console.error("bossmind-production-reality-gate: /api/health not OK");
    process.exit(1);
  }
  console.log("  live home + footer anti-drift + /api/health: OK");
}

function maybeRecord() {
  if (process.env.BOSSMIND_CLOSED_LOOP_RECORD !== "1") return;
  const taskId = process.env.BOSSMIND_CLOSED_LOOP_TASK_ID || "";
  if (!taskId) {
    console.warn("bossmind-production-reality-gate: BOSSMIND_CLOSED_LOOP_RECORD=1 but BOSSMIND_CLOSED_LOOP_TASK_ID empty — skip record");
    return;
  }
  const live = (process.env.BOSSMIND_REALITY_LIVE_URL || "").replace(/\/$/, "");
  const commit = process.env.GITHUB_SHA || process.env.RENDER_GIT_COMMIT || "";
  run(
    "Neon closed-loop record",
    "node",
    [
      "scripts/bossmind-closed-loop-record.mjs",
      `--task-id=${taskId}`,
      "--status=verified",
      ...(commit ? [`--commit=${commit}`] : []),
      ...(live ? [`--live-url=${live}`, "--routes=/,/pricing"] : []),
      "--notes=reality_gate_passed",
    ],
    process.env
  );
}

if (process.env.BOSSMIND_REALITY_SKIP_BUILD !== "1") {
  run("Production build", npm, ["run", "build"]);
} else {
  console.log("\n→ Production build: skipped (BOSSMIND_REALITY_SKIP_BUILD=1)");
}

let probe = (
  process.env.BOSSMIND_IMMUTABLE_PROBE_ORIGIN ||
  process.env.BOSSMIND_REALITY_LIVE_URL ||
  ""
).replace(/\/$/, "");
if (!probe && process.env.BOSSMIND_IMMUTABLE_PROBE_FROM_LOCK === "1") {
  try {
    const { getSiteUrl } = require(join(root, "lib/marketing/seo-config.js"));
    probe = String(getSiteUrl() || "").replace(/\/$/, "");
  } catch {
    probe = "";
  }
}

const lockEnv = {};
if (probe) lockEnv.BOSSMIND_IMMUTABLE_PROBE_ORIGIN = probe;

run("Locked production verify", npm, ["run", "bossmind:locked-production:verify"], lockEnv);

await liveChecks();

maybeRecord();

console.log("\nbossmind-production-reality-gate: OK — build + design lock + optional live checks passed.");
process.exit(0);
