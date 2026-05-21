#!/usr/bin/env node
/**
 * Maximum production stabilization — closed deployment loop + enterprise proof bundle.
 * Chains preflight, live health, activation proof, recovery dry-run, final validation.
 *
 *   npm run bossmind:maximum:stabilize
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync, execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const hubRoot = process.env.BOSSMIND_HUB_ROOT || "D:/BossMind";
const hubMemoryDir = path.join(hubRoot, "13-shared-memory");
const PRODUCTION_BASES = [
  process.env.BOSSMIND_VALIDATION_BASE || "https://bossmind-resumora-web.onrender.com",
  "https://www.resumora.net",
].filter((v, i, a) => a.indexOf(v) === i);

function hasFlag(n) {
  return process.argv.includes(`--${n}`);
}

function runNpm(script, extraArgs = []) {
  const r = spawnSync("npm", ["run", script, "--", ...extraArgs], {
    cwd: root,
    encoding: "utf8",
    shell: true,
  });
  return {
    ok: r.status === 0,
    status: r.status,
    stdout: (r.stdout || "").slice(-6000),
    stderr: (r.stderr || "").slice(-2000),
  };
}

function getGitHead() {
  try {
    return execSync("git rev-parse HEAD", { cwd: root, encoding: "utf8" }).trim();
  } catch {
    return "";
  }
}

async function fetchJson(url, init = {}) {
  try {
    const res = await fetch(url, { ...init, signal: AbortSignal.timeout(45000) });
    const body = await res.json().catch(() => ({}));
    return { status: res.status, ok: res.ok, body };
  } catch (e) {
    return { status: 0, ok: false, body: { error: e.message } };
  }
}

async function probeActivationEndpoints(base) {
  const o = base.replace(/\/$/, "");
  const health = await fetchJson(`${o}/api/health`);
  const activate = await fetchJson(`${o}/api/client/activate-plan?session_id=cs_test_invalid`);
  const workspace = await fetchJson(`${o}/api/client/workspace?lang=en`);
  const recovery = await fetchJson(`${o}/api/client/checkout-recovery?lang=en`);
  return {
    base: o,
    healthOk: health.body?.ok === true,
    databaseOk: health.body?.database?.ok === true,
    stripeReady: health.body?.stripe?.configured === true,
    gitCommit: health.body?.gitCommit || null,
    activateResponds: activate.status === 401 || activate.status === 400 || activate.status === 200,
    workspaceResponds: workspace.status === 200 || workspace.status === 401,
    recoveryResponds: recovery.status === 400 || recovery.status === 200,
  };
}

function scanForObviousSecrets() {
  const patterns = [
    /sk_live_[a-zA-Z0-9]{20,}/,
    /rk_live_[a-zA-Z0-9]{20,}/,
    /whsec_[a-zA-Z0-9]{20,}/,
  ];
  const dirs = ["pages", "components", "lib", "scripts"];
  const hits = [];
  for (const dir of dirs) {
    const full = path.join(root, dir);
    if (!fs.existsSync(full)) continue;
    const walk = (p) => {
      for (const ent of fs.readdirSync(p, { withFileTypes: true })) {
        const fp = path.join(p, ent.name);
        if (ent.isDirectory()) {
          if (ent.name === "node_modules" || ent.name === ".next") continue;
          walk(fp);
          continue;
        }
        if (!/\.(js|jsx|mjs|ts|tsx|json)$/.test(ent.name)) continue;
        const txt = fs.readFileSync(fp, "utf8");
        for (const re of patterns) {
          if (re.test(txt)) hits.push({ file: path.relative(root, fp), pattern: re.source });
        }
      }
    };
    walk(full);
  }
  return { ok: hits.length === 0, hits: hits.slice(0, 20) };
}

function stabilityScore(report) {
  let score = 0;
  if (report.build?.ok) score += 15;
  if (report.preflight?.ok) score += 10;
  if (report.secretScan?.ok) score += 15;
  if (report.entitlementProof?.ok) score += 20;
  if (report.finalValidation?.ok) score += 20;
  const liveOk = (report.liveProbes || []).filter((p) => p.healthOk && p.databaseOk).length;
  score += Math.min(20, liveOk * 10);
  return Math.min(100, score);
}

async function main() {
  const stamp = new Date().toISOString().slice(0, 10);
  const head = getGitHead();
  const report = {
    schema: "bossmind-maximum-stabilization-v1",
    generatedAt: new Date().toISOString(),
    gitHead: head,
    dryRun: hasFlag("dry-run"),
    phases: {},
  };

  console.log("[maximum-stabilize] build...");
  const build = spawnSync("npm", ["run", "build"], { cwd: root, encoding: "utf8", shell: true });
  report.build = { ok: build.status === 0, status: build.status };
  report.phases.build = report.build.ok ? "pass" : "fail";

  console.log("[maximum-stabilize] enterprise preflight...");
  report.preflight = runNpm("bossmind:enterprise:preflight");
  report.phases.preflight = report.preflight.ok ? "pass" : "warn";

  console.log("[maximum-stabilize] secret scan...");
  report.secretScan = scanForObviousSecrets();
  report.phases.secretScan = report.secretScan.ok ? "pass" : "fail";

  console.log("[maximum-stabilize] entitlement activation proof...");
  report.entitlementProof = runNpm("bossmind:entitlement:proof");
  report.phases.entitlementProof = report.entitlementProof.ok ? "pass" : "warn";

  console.log("[maximum-stabilize] activation recovery (dry)...");
  report.activationRecovery = runNpm("bossmind:activation:recover", ["--no-live"]);
  report.phases.activationRecovery = report.activationRecovery.ok ? "pass" : "warn";

  console.log("[maximum-stabilize] final production validation...");
  report.finalValidation = runNpm("bossmind:final:production-validation");
  report.phases.finalValidation = report.finalValidation.ok ? "pass" : "warn";

  console.log("[maximum-stabilize] live probes...");
  report.liveProbes = [];
  for (const base of PRODUCTION_BASES) {
    report.liveProbes.push(await probeActivationEndpoints(base));
  }
  report.phases.liveProbes = report.liveProbes.some((p) => p.healthOk && p.databaseOk) ? "pass" : "warn";

  report.stabilityScore = stabilityScore(report);
  report.productionReady = report.build.ok && report.secretScan.ok && report.stabilityScore >= 70;
  report.deploymentProof = {
    checksum: crypto
      .createHash("sha256")
      .update(`${head}|${report.stabilityScore}|${report.liveProbes.map((p) => p.gitCommit).join(",")}`)
      .digest("hex")
      .slice(0, 16),
    closedLoop: report.phases,
  };
  report.orchestrationVerification = {
    entitlementPipeline: report.entitlementProof.ok,
    activationRecovery: report.activationRecovery.ok,
    liveActivationApis: report.liveProbes.every((p) => p.activateResponds && p.workspaceResponds),
  };
  report.selfHealingVerification = {
    preflight: report.preflight.ok,
    secretLeakPrevention: report.secretScan.ok,
    ultraStabilizeAvailable: fs.existsSync(path.join(root, "scripts/bossmind-ultra-stabilization.mjs")),
  };

  fs.mkdirSync(hubMemoryDir, { recursive: true });
  const outPath = path.join(hubMemoryDir, `resumora-maximum-stabilization-${stamp}.json`);
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2), "utf8");
  console.log(`[maximum-stabilize] report → ${outPath}`);
  console.log(`[maximum-stabilize] stability score: ${report.stabilityScore}/100 productionReady=${report.productionReady}`);

  if (!report.build.ok) process.exit(1);
  if (!report.secretScan.ok) process.exit(2);
  process.exit(report.productionReady ? 0 : 3);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
