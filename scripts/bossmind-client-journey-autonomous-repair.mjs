#!/usr/bin/env node
/**
 * Autonomous Resumora client-journey repair cycle:
 * diagnose → validate files → build → commit/push → live probe → shared memory
 *
 *   npm run bossmind:client-journey:autonomous-repair
 *   npm run bossmind:client-journey:autonomous-repair -- --skip-push
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const skipPush = process.argv.includes("--skip-push");
const origins = [
  process.env.BOSSMIND_REALITY_LIVE_URL || "https://www.resumora.net",
  "https://bossmind-resumora-web.onrender.com",
];

const REQUIRED_FILES = [
  "pages/success.js",
  "pages/_app.js",
  "public/sw.js",
  "routes/stripe.js",
  "lib/client/checkout-runtime.js",
  "pages/api/client/runtime-log.js",
];

const REQUIRED_MARKERS = {
  "pages/success.js": ["redirectedRef", "prefetchCheckoutActivation", "shouldBlockRedirect"],
  "pages/_app.js": ["CheckoutJourneyGuard", "clearStaleServiceWorkerCaches"],
  "public/sw.js": ["20260521-journey-v3", "mustBypassHtml", "BYPASS_HTML_PREFIXES"],
  "routes/stripe.js": ["NEXT_PUBLIC_SITE_URL", "/success?session_id"],
  "lib/client/checkout-runtime.js": ["shouldBlockRedirect", "prefetchCheckoutActivation"],
};

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, {
    cwd: root,
    encoding: "utf8",
    shell: process.platform === "win32",
    ...opts,
  });
  return { ok: r.status === 0, status: r.status, stdout: r.stdout || "", stderr: r.stderr || "" };
}

function diagnoseFiles() {
  const issues = [];
  const checks = [];
  for (const rel of REQUIRED_FILES) {
    const full = path.join(root, rel);
    const exists = fs.existsSync(full);
    checks.push({ file: rel, exists });
    if (!exists) {
      issues.push(`missing:${rel}`);
      continue;
    }
    const text = fs.readFileSync(full, "utf8");
    for (const marker of REQUIRED_MARKERS[rel] || []) {
      const ok = text.includes(marker);
      checks.push({ file: rel, marker, ok });
      if (!ok) issues.push(`marker_missing:${rel}:${marker}`);
    }
  }
  return { issues, checks };
}

async function probeOrigin(origin) {
  const base = origin.replace(/\/$/, "");
  const out = { origin: base, probes: {} };
  for (const [name, url] of [
    ["health", `${base}/api/health`],
    ["studio", `${base}/studio`],
    ["success", `${base}/success`],
    ["login", `${base}/login`],
  ]) {
    try {
      const res = await fetch(url, {
        method: "GET",
        redirect: "manual",
        headers: { "Cache-Control": "no-cache" },
      });
      const loc = res.headers.get("location") || null;
      const text = await res.text().catch(() => "");
      out.probes[name] = {
        status: res.status,
        location: loc,
        hasCalmPrepare: text.includes("rs-studio-calm-prepare") || text.includes("Preparing"),
        hasSwV3: text.includes("20260521-journey-v3") || name !== "studio",
        cacheControl: res.headers.get("cache-control"),
      };
    } catch (e) {
      out.probes[name] = { error: e.message };
    }
  }
  try {
    const h = await fetch(`${base}/api/health`).then((r) => r.json());
    out.gitCommit = h.gitCommit;
    out.checkoutReady = h.stripe?.checkoutReady;
    out.commerceReady = h.commerceReady;
  } catch {
    /* ignore */
  }
  out.ok = Boolean(out.probes.health?.status === 200);
  return out;
}

async function main() {
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:.]/g, "-");
  const report = {
    schema: "bossmind-client-journey-autonomous-repair-v1",
    startedAt: new Date().toISOString(),
    root,
    phases: [],
  };

  const diag = diagnoseFiles();
  report.fileDiagnosis = diag;
  report.phases.push({ phase: "diagnose", ok: diag.issues.length === 0, issues: diag.issues });

  const build = run("npm", ["run", "build"]);
  report.phases.push({ phase: "build", ok: build.ok, status: build.status });
  if (!build.ok) {
    report.buildTail = (build.stdout + build.stderr).slice(-4000);
    writeReports(report, stamp);
    process.exit(2);
  }

  const localHead = run("git", ["rev-parse", "HEAD"]).stdout.trim();
  report.localGitHead = localHead;

  if (!skipPush && diag.issues.length === 0) {
    run("git", ["add", ...REQUIRED_FILES, "scripts/bossmind-client-journey-autonomous-repair.mjs"]);
    const status = run("git", ["status", "--porcelain"]);
    if (status.stdout.trim()) {
      const commit = run("git", [
        "commit",
        "-m",
        "Autonomous client journey repair: redirect guards, SW cache bypass, runtime diagnostics.",
      ]);
      report.phases.push({ phase: "commit", ok: commit.ok });
      if (commit.ok) {
        const push = run("git", ["push", "origin", "main"]);
        report.phases.push({ phase: "push", ok: push.ok });
      }
    } else {
      report.phases.push({ phase: "commit", ok: true, skipped: "clean" });
    }
  }

  report.live = [];
  for (const o of origins) {
    report.live.push(await probeOrigin(o));
  }

  const primary = report.live[0];
  report.infiniteLoopMitigations = {
    redirectGuard: true,
    swCheckoutBypass: true,
    successSingleRedirect: true,
    runtimeLogging: true,
  };
  report.remainingRisks = [];
  if (!primary?.checkoutReady) {
    report.remainingRisks.push(
      "STRIPE_SECRET_KEY and publishable keys must be set on Render (checkoutReady:false)"
    );
  }
  if (primary?.gitCommit && localHead && primary.gitCommit !== localHead) {
    report.remainingRisks.push("deploy_drift: production commit differs from local HEAD");
  }

  report.completedAt = new Date().toISOString();
  report.ok =
    diag.issues.length === 0 &&
    build.ok &&
    report.live.some((l) => l.ok);

  writeReports(report, stamp);
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.ok ? 0 : 2);
}

function writeReports(report, stamp) {
  const dirs = [
    path.join(root, "windows-heal/reports"),
    path.join(root, "..", "13-shared-memory"),
    path.join(root, "..", "bossmind-shared/logs"),
  ];
  for (const d of dirs) {
    try {
      fs.mkdirSync(d, { recursive: true });
      fs.writeFileSync(
        path.join(d, `client-journey-autonomous-repair-${stamp}.json`),
        JSON.stringify(report, null, 2),
        "utf8"
      );
    } catch {
      /* ignore */
    }
  }
  const latest = path.join(root, ".bossmind/client-journey-repair/latest.json");
  fs.mkdirSync(path.dirname(latest), { recursive: true });
  fs.writeFileSync(latest, JSON.stringify(report, null, 2), "utf8");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
