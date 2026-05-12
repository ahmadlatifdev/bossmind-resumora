#!/usr/bin/env node
/**
 * BossMind Enterprise Envelope — orchestrates existing protection/validation scripts into one
 * auditable run + Neon proof event + local JSONL ledger.
 *
 * Does NOT auto-deploy to Railway/Render, mutate protected pages, or claim multi-cloud revision sync
 * without platform tokens (see config/bossmind-enterprise-envelope.json).
 *
 * Usage:
 *   node scripts/bossmind-enterprise-envelope.mjs
 *   node scripts/bossmind-enterprise-envelope.mjs --from-autonomous
 *   node scripts/bossmind-enterprise-envelope.mjs --dry-run
 *
 * Env:
 *   BOSSMIND_ENVELOPE_EXTENDED=1 — perf-scan, ui-probe, ui-baseline, immutable-verify, orchestration-audit
 *   BOSSMIND_ENVELOPE_RUN_DEPLOY_GATE=1 — full deploy gate (lint/build/heavy)
 *   BOSSMIND_ENVELOPE_SKIP_PRESERVATION=1 — skip preservation-validate (default if no backup manifest)
 *   BOSSMIND_ENVELOPE_SKIP_STRIPE=1 — skip stripe-env-validation.js
 *   BOSSMIND_ENVELOPE_ENFORCE_RISK=1 — exit non-zero if predictive risk script exits 2
 */
import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";
import { createRequire } from "module";
import { fileURLToPath } from "url";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const ledgerDir = path.join(root, ".bossmind", "ledger");
const ledgerPath = path.join(ledgerDir, "enterprise-envelope.jsonl");
const projectKey = process.env.BOSSMIND_PROJECT_KEY || "resumora";

function loadEnv() {
  try {
    require(path.join(root, "lib/shared/load-project-env.js")).loadProjectEnv(root);
  } catch {
    /* ignore */
  }
}

function parseArgs() {
  const a = process.argv.slice(2);
  return {
    fromAutonomous: a.includes("--from-autonomous"),
    dryRun: a.includes("--dry-run"),
  };
}

function gitHead() {
  const r = spawnSync("git rev-parse HEAD", { cwd: root, shell: true, encoding: "utf8" });
  return (r.stdout || "").trim() || null;
}

function ensureLedgerDir() {
  fs.mkdirSync(ledgerDir, { recursive: true });
}

function runNode(scriptRel, args = [], extraEnv = {}) {
  const t0 = Date.now();
  const res = spawnSync(process.execPath, [path.join(root, scriptRel), ...args], {
    cwd: root,
    encoding: "utf8",
    stdio: "pipe",
    env: { ...process.env, ...extraEnv },
    maxBuffer: 12 * 1024 * 1024,
  });
  const ok = (res.status ?? 1) === 0;
  return {
    ok,
    code: res.status ?? 1,
    ms: Date.now() - t0,
    stderrTail: (res.stderr || "").slice(-2500),
  };
}

function runNpm(script, extraEnv = {}) {
  const t0 = Date.now();
  const isWin = process.platform === "win32";
  const npm = isWin ? "npm.cmd" : "npm";
  const res = spawnSync(npm, ["run", script], {
    cwd: root,
    shell: true,
    encoding: "utf8",
    stdio: "pipe",
    env: { ...process.env, ...extraEnv },
    maxBuffer: 12 * 1024 * 1024,
  });
  const ok = (res.status ?? 1) === 0;
  return {
    ok,
    code: res.status ?? 1,
    ms: Date.now() - t0,
    stderrTail: (res.stderr || "").slice(-2500),
  };
}

function runNodeScript(scriptPath, args = []) {
  const t0 = Date.now();
  const res = spawnSync(process.execPath, [path.join(root, scriptPath), ...args], {
    cwd: root,
    encoding: "utf8",
    stdio: "pipe",
    maxBuffer: 6 * 1024 * 1024,
  });
  const ok = (res.status ?? 1) === 0;
  return {
    ok,
    code: res.status ?? 1,
    ms: Date.now() - t0,
    stdout: (res.stdout || "").trim(),
    stderrTail: (res.stderr || "").slice(-2000),
  };
}

function preservationManifestExists() {
  const backupRoot = path.resolve(
    root,
    process.env.BOSSMIND_BACKUP_ROOT || path.join(".bossmind", "backups", "rolling-30d")
  );
  return fs.existsSync(path.join(backupRoot, "protected", "latest-verified-manifest.json"));
}

async function saveNeon(payload) {
  try {
    const neon = require(path.join(root, "lib/shared/neon-memory.js"));
    const init = await neon.initializeSharedMemory();
    if (!init.enabled) return { saved: false, reason: init.reason };
    await neon.saveEvent({
      projectKey,
      eventType: payload.ok ? "bossmind.enterprise_envelope.completed" : "bossmind.enterprise_envelope.failed",
      severity: payload.ok ? "info" : "warning",
      source: "bossmind-enterprise-envelope",
      eventKey: payload.envelopeId,
      payload,
    });
    return { saved: true };
  } catch (e) {
    return { saved: false, reason: e.message || String(e) };
  }
}

async function main() {
  loadEnv();
  const opts = parseArgs();
  const envelopeId = `env_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const phases = [];
  const light = opts.fromAutonomous;

  const push = (id, result, skipped = false, reason = "") => {
    phases.push({
      id,
      ok: skipped ? true : result.ok,
      skipped,
      skipReason: skipped ? reason : "",
      code: skipped ? 0 : result.code,
      ms: skipped ? 0 : result.ms,
      ...(result.stderrTail && !skipped ? { stderrTail: result.stderrTail } : {}),
    });
  };

  const exec = (id, fn) => {
    if (opts.dryRun) {
      push(id, { ok: true, code: 0, ms: 0 }, true, "dry_run");
      return;
    }
    const r = fn();
    push(id, r);
  };

  /** Predictive risk (exit 2 = high risk; optional enforce). */
  let riskJson = null;
  if (!opts.dryRun) {
    const pr = runNodeScript("scripts/bossmind-predictive-runtime-risk.mjs");
    try {
      riskJson = JSON.parse(pr.stdout || "{}");
    } catch {
      riskJson = { parseError: true, stdout: (pr.stdout || "").slice(0, 200) };
    }
    const enforce = process.env.BOSSMIND_ENVELOPE_ENFORCE_RISK === "1";
    const riskOk = pr.code === 0 || (pr.code === 2 && !enforce);
    phases.push({
      id: "predictive_runtime_risk",
      ok: riskOk,
      skipped: false,
      code: pr.code,
      ms: pr.ms,
      risk: riskJson,
    });
  } else {
    push("predictive_runtime_risk", { ok: true, code: 0, ms: 0 }, true, "dry_run");
  }

  exec("hosting_guard", () => runNode("scripts/bossmind-hosting-guard.mjs"));
  exec("protected_surface", () => runNode("scripts/bossmind-protected-surface-verify.mjs"));

  if (process.env.BOSSMIND_SKIP_ANTILEAK === "1") {
    push("antileak", { ok: true, code: 0, ms: 0 }, true, "BOSSMIND_SKIP_ANTILEAK=1");
  } else {
    exec("antileak", () => runNode("scripts/bossmind-antileak-guard.mjs"));
  }

  if (!light) {
    exec("env_keys_audit", () => runNode("scripts/bossmind-env-keys-audit.mjs"));
    if (process.env.BOSSMIND_ENVELOPE_SKIP_STRIPE === "1") {
      push("stripe_env_validation", { ok: true, code: 0, ms: 0 }, true, "BOSSMIND_ENVELOPE_SKIP_STRIPE=1");
    } else {
      exec("stripe_env_validation", () => {
      const r = runNodeScript("scripts/stripe-env-validation.js");
      return { ok: r.ok, code: r.code, ms: r.ms, stderrTail: r.stderrTail };
    });
    }
    exec("validate_deps", () => runNpm("validate:deps"));
  } else {
    push("env_keys_audit", { ok: true, code: 0, ms: 0 }, true, "light_from_autonomous");
    push("stripe_env_validation", { ok: true, code: 0, ms: 0 }, true, "light_from_autonomous");
    push("validate_deps", { ok: true, code: 0, ms: 0 }, true, "light_from_autonomous");
  }

  exec("runtime_sync", () => runNode("scripts/bossmind-runtime-sync.mjs", ["--once"]));
  exec("reconciliation", () => runNode("scripts/bossmind-reconciliation-engine.mjs"));
  exec("monitor_health", () => runNode("scripts/bossmind-monitor-health.mjs"));

  const skipPres =
    process.env.BOSSMIND_ENVELOPE_SKIP_PRESERVATION === "1" || !preservationManifestExists();
  if (skipPres) {
    push(
      "preservation_validate",
      { ok: true, code: 0, ms: 0 },
      true,
      !preservationManifestExists() ? "no_backup_manifest" : "BOSSMIND_ENVELOPE_SKIP_PRESERVATION=1"
    );
  } else {
    exec("preservation_validate", () => runNode("scripts/bossmind-preservation-validate.mjs"));
  }

  if (!light && process.env.BOSSMIND_ENVELOPE_EXTENDED === "1") {
    exec("performance_scan", () => runNode("scripts/bossmind-performance-scan.mjs"));
    exec("ui_probe", () => runNode("scripts/bossmind-ui-probe.mjs"));
    exec("ui_baseline_verify", () => runNode("scripts/bossmind-ui-baseline-verify.mjs"));
    const probeEnv =
      process.env.BOSSMIND_IMMUTABLE_PROBE_ORIGIN || process.env.BOSSMIND_PRODUCTION_PUBLIC_ORIGIN || "";
    exec("immutable_verify", () =>
      runNode("scripts/bossmind-immutable-verify.mjs", [], probeEnv ? { BOSSMIND_IMMUTABLE_PROBE_ORIGIN: probeEnv } : {})
    );
    exec("orchestration_audit", () => runNode("scripts/bossmind-orchestration-audit.mjs"));
  }

  if (!light && process.env.BOSSMIND_ENVELOPE_RUN_DEPLOY_GATE === "1") {
    exec("deploy_gate", () =>
      runNode("scripts/bossmind-deploy-gate.mjs", [], {
        BOSSMIND_DEPLOY_GATE_SKIP_LINT: process.env.BOSSMIND_DEPLOY_GATE_SKIP_LINT || "0",
      })
    );
  }

  const allOk = phases.filter((p) => !p.skipped).every((p) => p.ok);

  const summary = {
    envelopeId,
    ok: allOk,
    projectKey,
    gitHead: gitHead(),
    fromAutonomous: opts.fromAutonomous,
    dryRun: opts.dryRun,
    risk: riskJson,
    phases,
    ts: new Date().toISOString(),
    policyNote:
      "Platform revision parity (GitHub/Railway/Render) requires external APIs; supervisor multi-worker = parallel lanes with Neon SKIP LOCKED.",
  };

  if (!opts.dryRun) {
    ensureLedgerDir();
    fs.appendFileSync(ledgerPath, `${JSON.stringify(summary)}\n`, "utf8");
  }

  const neonResult = opts.dryRun ? { saved: false, reason: "dry_run" } : await saveNeon(summary);
  summary.neon = neonResult;

  console.log(JSON.stringify(summary, null, 2));
  process.exit(allOk ? 0 : 1);
}

main().catch((e) => {
  console.error("[bossmind-enterprise-envelope]", e);
  process.exit(1);
});
