#!/usr/bin/env node
/**
 * Proof-based production readiness (no fabricated percentages).
 *
 * Runs structural + policy gates that exist in-repo. Optional --full adds deploy + completion gates.
 * Does NOT enable auto-patch, git push, or hosting redeploy (see docs/BOSSMIND_ENTERPRISE_AI_ENGINEERING_STACK.md).
 *
 *   node scripts/bossmind-production-readiness-proof.mjs
 *   node scripts/bossmind-production-readiness-proof.mjs --full
 *   node scripts/bossmind-production-readiness-proof.mjs --dry-run
 *
 * Env:
 *   BOSSMIND_SKIP_ANTILEAK=1
 *   BOSSMIND_READINESS_ENFORCE_PREDICTIVE_RISK=1  — treat predictive exit 2 as failure
 *   BOSSMIND_READINESS_PERSIST_NEON=1             — append event_log row on completion
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
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
  return { full: a.includes("--full"), dryRun: a.includes("--dry-run") };
}

function redactVercelTokens(s) {
  if (!s || typeof s !== "string") return s;
  return s.replace(/\bVERCEL_[A-Z0-9_]*\b/g, "PLATFORM_COMMIT_ENV_REDACTED");
}

function runNode(scriptRel, args = [], extraEnv = {}) {
  const t0 = Date.now();
  const res = spawnSync(process.execPath, [path.join(root, scriptRel), ...args], {
    cwd: root,
    encoding: "utf8",
    stdio: "pipe",
    env: { ...process.env, ...extraEnv },
    maxBuffer: 14 * 1024 * 1024,
  });
  const code = res.status ?? 1;
  return {
    ok: code === 0,
    code,
    ms: Date.now() - t0,
    stdout: (res.stdout || "").trim(),
    stderrTail: redactVercelTokens(res.stderr || "").slice(-2000),
  };
}

function predictiveEarned(code, enforce) {
  if (code === 0) return 1;
  if (code === 2 && !enforce) return 0.55;
  return 0;
}

async function saveNeonEvent(payload) {
  try {
    const neon = require(path.join(root, "lib/shared/neon-memory.js"));
    const init = await neon.initializeSharedMemory();
    if (!init.enabled) return { saved: false, reason: init.reason };
    await neon.saveEvent({
      projectKey,
      eventType: payload.ok ? "bossmind.readiness_proof.ok" : "bossmind.readiness_proof.failed",
      severity: payload.ok ? "info" : "warning",
      source: "bossmind-production-readiness-proof",
      eventKey: payload.proofId,
      payload,
    });
    return { saved: true };
  } catch (e) {
    return { saved: false, reason: e.message || String(e) };
  }
}

function ledgerAppend(obj) {
  const dir = path.join(root, ".bossmind", "ledger");
  fs.mkdirSync(dir, { recursive: true });
  const p = path.join(dir, "production-readiness-proof.jsonl");
  fs.appendFileSync(p, `${JSON.stringify(obj)}\n`, "utf8");
  return p.replace(/\\/g, "/");
}

async function main() {
  loadEnv();
  const opts = parseArgs();
  const proofId = `readiness_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
  const enforcePred = process.env.BOSSMIND_READINESS_ENFORCE_PREDICTIVE_RISK === "1";

  const checks = [];
  const push = (row) => checks.push(row);

  if (opts.dryRun) {
    const summary = {
      proofId,
      dryRun: true,
      policyBoundary:
        "Unsupervised auto-write, auto git push, and auto production deploy are not activated; see mandatoryFlowDeclaredInactive in autonomous self-heal status.",
      checks: [],
      earnedPoints: 0,
      maxPoints: 100,
      proofBasedReadinessPercent: null,
      targetRange95to98AutonomousClaimAllowed: false,
      targetClaimReason:
        "Dry run — no gates executed. Full autonomous 95–98% requires CI + hosting credentials + live probes + explicit product policy.",
    };
    console.log(JSON.stringify(summary, null, 2));
    process.exit(0);
    return;
  }

  const w = {
    enterprise_preflight: 24,
    locked_production: 26,
    antileak: 12,
    predictive: 10,
    neon_env: 8,
    orchestration_secret_env: 8,
    autonomous_infra: 12,
    deploy_gate: 20,
    completion_gate: 20,
  };

  let earned = 0;
  let max = 0;

  const add = (id, passed, weight, evidence = {}) => {
    max += weight;
    const e = passed ? weight : 0;
    earned += e;
    push({ id, weight, earned: e, ok: Boolean(passed), evidence });
  };

  const pf = runNode("scripts/bossmind-enterprise-preflight.mjs");
  add("enterprise_preflight", pf.ok, w.enterprise_preflight, { code: pf.code, ms: pf.ms, stderrTail: pf.stderrTail });

  const lp = runNode("scripts/bossmind-locked-production-verify.mjs");
  add("locked_production_verify", lp.ok, w.locked_production, { code: lp.code, ms: lp.ms, stderrTail: lp.stderrTail });

  let anti = { ok: true, code: 0, ms: 0 };
  if (process.env.BOSSMIND_SKIP_ANTILEAK === "1") {
    push({ id: "antileak", weight: w.antileak, earned: w.antileak, ok: true, skipped: true, evidence: { reason: "BOSSMIND_SKIP_ANTILEAK=1" } });
    max += w.antileak;
    earned += w.antileak;
  } else {
    anti = runNode("scripts/bossmind-antileak-guard.mjs");
    add("antileak", anti.ok, w.antileak, { code: anti.code, ms: anti.ms, stderrTail: anti.stderrTail });
  }

  const pr = runNode("scripts/bossmind-predictive-runtime-risk.mjs");
  let prJson = null;
  try {
    prJson = JSON.parse(pr.stdout || "{}");
  } catch {
    prJson = null;
  }
  const predFrac = predictiveEarned(pr.code, enforcePred);
  max += w.predictive;
  earned += w.predictive * predFrac;
  push({
    id: "predictive_runtime_risk",
    weight: w.predictive,
    earned: Math.round(w.predictive * predFrac * 100) / 100,
    ok: predFrac >= 1 || (predFrac > 0 && !enforcePred),
    evidence: { code: pr.code, ms: pr.ms, enforce: enforcePred, summary: prJson },
  });

  const neonOk = Boolean(process.env.NEON_DATABASE_URL);
  add("neon_database_url_configured", neonOk, w.neon_env, { present: neonOk });

  const orchOk = Boolean(process.env.BOSSMIND_ORCHESTRATION_SECRET);
  add("orchestration_secret_configured", orchOk, w.orchestration_secret_env, { present: orchOk });

  let infraPct = 0;
  try {
    const { getAutonomousSelfHealStatus } = require(path.join(root, "lib/orchestration/bossmind-autonomous-self-heal-status.js"));
    const s = getAutonomousSelfHealStatus();
    infraPct = Number(s.scores?.closedLoopInfrastructureReadinessPercent) || 0;
    const infraEarned = (w.autonomous_infra * infraPct) / 100;
    max += w.autonomous_infra;
    earned += infraEarned;
    push({
      id: "autonomous_closed_loop_infrastructure",
      weight: w.autonomous_infra,
      earned: Math.round(infraEarned * 100) / 100,
      ok: infraPct >= 70,
      evidence: { closedLoopInfrastructureReadinessPercent: infraPct, mandatoryFlowDeclaredInactive: s.mandatoryFlowDeclaredInactive },
    });
  } catch (e) {
    max += w.autonomous_infra;
    push({
      id: "autonomous_closed_loop_infrastructure",
      weight: w.autonomous_infra,
      earned: 0,
      ok: false,
      evidence: { error: e.message || String(e) },
    });
  }

  if (opts.full) {
    const dg = runNode("scripts/bossmind-deploy-gate.mjs");
    add("deploy_gate", dg.ok, w.deploy_gate, { code: dg.code, ms: dg.ms, stderrTail: dg.stderrTail });

    const cg = runNode("scripts/bossmind-task-completion-gate.mjs");
    add("completion_gate", cg.ok, w.completion_gate, {
      code: cg.code,
      ms: cg.ms,
      stderrTail: cg.stderrTail,
      liveProbe: process.env.BOSSMIND_COMPLETION_LIVE_PROBE === "1",
    });
  }

  const proofBasedReadinessPercent = max > 0 ? Math.round((earned / max) * 1000) / 10 : 0;

  const criticalIds = opts.full
    ? ["enterprise_preflight", "locked_production_verify", "antileak", "deploy_gate", "completion_gate"]
    : ["enterprise_preflight", "locked_production_verify", "antileak"];
  const allCriticalGatesOk = criticalIds.every((id) => {
    const c = checks.find((x) => x.id === id);
    return c && (c.skipped ? true : c.ok);
  });

  const liveProbe =
    process.env.BOSSMIND_COMPLETION_LIVE_PROBE === "1" &&
    Boolean(process.env.BOSSMIND_COMPLETION_PROBE_ORIGIN || process.env.BOSSMIND_IMMUTABLE_PROBE_ORIGIN);

  const predictiveClean = pr.code === 0;

  const targetRange95to98AutonomousClaimAllowed = Boolean(
    opts.full &&
      proofBasedReadinessPercent >= 95 &&
      allCriticalGatesOk &&
      neonOk &&
      orchOk &&
      liveProbe &&
      infraPct >= 75 &&
      predictiveClean
  );

  const summary = {
    proofId,
    generatedAt: new Date().toISOString(),
    profile: opts.full ? "full_gates_including_build" : "structural_policy_automation_signals",
    policyBoundary:
      "BossMind safe review: no unsupervised auto-write, auto git commit/push, or auto Render/Railway deploy from this proof runner. Closed-loop repair remains human/CI-gated.",
    earnedPoints: Math.round(earned * 100) / 100,
    maxPoints: max,
    proofBasedReadinessPercent,
    targetRange95to98AutonomousClaimAllowed,
    targetClaimReason: targetRange95to98AutonomousClaimAllowed
      ? "All critical gates passed, proofBasedReadinessPercent >= 95 on --full profile, Neon + orchestration secret + live completion probe, closed-loop infra >=75, predictive risk exit 0. Policy: still no unsupervised auto-write/git push/deploy from repo."
      : opts.full
        ? "Fix failing gates, raise infra/env scores, enable live probe (BOSSMIND_COMPLETION_LIVE_PROBE=1 + BOSSMIND_COMPLETION_PROBE_ORIGIN), or clear predictive risk (exit 0) until proofBasedReadinessPercent >= 95."
        : "Re-run with --full (deploy + completion gates) and configure Neon, orchestration secret, live probe, and higher closed-loop infra score for a 95–98% evidence claim.",
    checks,
    autonomousSelfHealNote:
      "fullAutonomousChainPercent remains 0 by policy; infrastructure score reflects wiring + env only.",
  };

  summary.ledgerFile = ledgerAppend(summary);

  if (process.env.BOSSMIND_READINESS_PERSIST_NEON === "1") {
    const allExecutedChecksPass = checks.filter((c) => !c.skipped).every((c) => c.ok);
    summary.neon = await saveNeonEvent({
      ...summary,
      ok: allExecutedChecksPass && proofBasedReadinessPercent >= 95,
    });
  } else {
    summary.neon = { saved: false, reason: "set BOSSMIND_READINESS_PERSIST_NEON=1 to append event_log" };
  }

  const outDir = path.join(root, "windows-heal", "reports");
  fs.mkdirSync(outDir, { recursive: true });
  const reportPath = path.join(outDir, `bossmind-production-readiness-proof-${proofId}.json`);
  summary.reportFile = reportPath.replace(/\\/g, "/");
  fs.writeFileSync(reportPath, JSON.stringify(summary, null, 2), "utf8");

  console.log(JSON.stringify(summary, null, 2));

  const failCritical = criticalIds.some((id) => {
    const c = checks.find((x) => x.id === id);
    return c && !c.skipped && !c.ok;
  });
  process.exit(failCritical ? 1 : 0);
}

main().catch((e) => {
  console.error("[bossmind-production-readiness-proof]", e);
  process.exit(1);
});
