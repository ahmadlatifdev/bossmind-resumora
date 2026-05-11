#!/usr/bin/env node
/**
 * BossMind autonomous runtime synchronization loop — optimized path.
 *
 * Detect → Compare → Diagnose → Repair → Restore → Validate → Lock → Monitor
 * - Protected luxury baseline fingerprint + structural single-home authority
 * - Neon `runtime_authority` as shared-memory lock (optional)
 * - Tiered heal: clean cache → re-probe → build → re-probe
 *
 * Safety: never mutates .git — only .next cache + optional Neon rows.
 */
import fs from "fs";
import path from "path";
import crypto from "crypto";
import http from "http";
import https from "https";
import { execSync, spawnSync } from "child_process";
import { createRequire } from "module";
import { fileURLToPath } from "url";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const stateDir = path.join(root, ".bossmind", "runtime-sync");
const statusPath = path.join(stateDir, "status.json");

const {
  structuralAuthorityReport,
  computeAutonomyScores,
  loadManifest,
} = require(path.join(root, "lib/orchestration/bossmind-interface-authority.js"));
const {
  loadContinuePoint,
  saveContinuePoint,
} = require(path.join(root, "lib/orchestration/bossmind-last-confirmed-point.js"));
const {
  buildReconciliationSnapshot,
  persistReconciliation,
} = require(path.join(root, "lib/orchestration/bossmind-reconciliation.js"));

const projectKey = process.env.BOSSMIND_PROJECT_KEY || "resumora";
const authorityKey = process.env.BOSSMIND_AUTHORITY_KEY || "luxury_ui_baseline";
const origin = (process.env.BOSSMIND_MONITOR_ORIGIN || "http://127.0.0.1:3001").replace(/\/$/, "");
const intervalMs = Number(process.env.BOSSMIND_RUNTIME_SYNC_MS || 45000);
const lockOnStart = process.env.BOSSMIND_RUNTIME_SYNC_LOCK_ON_START !== "0";
const autoHeal = process.env.BOSSMIND_RUNTIME_SYNC_AUTO_HEAL !== "0";
const promoteOnVerify = process.env.BOSSMIND_AUTHORITY_PROMOTE_ON_VERIFY !== "0";
const autonomyMin = Number(process.env.BOSSMIND_AUTONOMY_MIN_SCORE || 90);
const requestTimeoutMs = Number(process.env.BOSSMIND_RUNTIME_SYNC_HTTP_MS || 12000);
const reconcileDeployHook = process.env.BOSSMIND_RECONCILE_DEPLOY_HOOK_URL || "";
const once = process.argv.includes("--once");
const dryRun = process.argv.includes("--dry-run");

async function notifyReconcileDeployHook(reconciliation) {
  if (!reconcileDeployHook || dryRun) return null;
  const min = Number(process.env.BOSSMIND_RECONCILE_DEPLOY_HOOK_MIN_SCORE || 95);
  if (!reconciliation?.ok || reconciliation.score < min) return { skipped: true, reason: "not_green" };
  try {
    const res = await fetch(reconcileDeployHook, {
      method: "POST",
      headers: { "content-type": "application/json", "user-agent": "BossMind-reconcile-hook/1.0" },
      body: JSON.stringify({
        event: "bossmind.reconciliation.promote_signal",
        ts: new Date().toISOString(),
        projectKey,
        score: reconciliation.score,
        alignmentBlend: reconciliation.alignmentBlend,
        signals: reconciliation.signals,
      }),
    });
    return { ok: res.ok, status: res.status };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function writeStatus(obj) {
  fs.mkdirSync(stateDir, { recursive: true });
  fs.writeFileSync(statusPath, JSON.stringify(obj, null, 2), "utf8");
}

function getGitHead() {
  try {
    return execSync("git rev-parse HEAD", { cwd: root, encoding: "utf8" }).trim();
  } catch {
    return "";
  }
}

function loadAuthorityMarkers() {
  const m = loadManifest(root) || {};
  return {
    requiredHomeHtmlMarkers:
      m.requiredHomeHtmlMarkers || [
        'id="top"',
        'id="trust"',
        'id="home-intake"',
        'id="pricing"',
        "rs-week-main",
        "rs-cta-strip",
      ],
    fingerprintExtraPaths: m.fingerprintExtraPaths || [],
  };
}

function loadProtectedPaths() {
  const cfgPath = path.join(root, "config", "bossmind-protected-surface.json");
  let fromCfg = [];
  try {
    const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
    fromCfg = [...(cfg.surfaceLockPaths || []), ...(cfg.shellLockPaths || [])];
  } catch {
    fromCfg = [];
  }
  const { fingerprintExtraPaths } = loadAuthorityMarkers();
  const mustHave = [
    "components/marketing/HomePage.jsx",
    "components/marketing/SiteChrome.js",
    "components/marketing/sections/TrustMetricsPanel.jsx",
    "components/marketing/sections/UploadPanel.jsx",
    "components/marketing/sections/PricingPanel.jsx",
    "pages/index.js",
    "context/LanguageContext.js",
    "lib/marketing/site-copy.js",
    "styles/resumora-global.css",
    "next.config.ts",
    ...fingerprintExtraPaths,
  ];
  return [...new Set([...fromCfg, ...mustHave])].sort();
}

function computeBaselineFingerprint() {
  const files = loadProtectedPaths();
  const parts = [];
  const missing = [];
  for (const rel of files) {
    const abs = path.join(root, ...rel.split("/"));
    if (!fs.existsSync(abs)) {
      missing.push(rel);
      parts.push(`${rel}:<missing>`);
      continue;
    }
    const body = fs.readFileSync(abs, "utf8");
    parts.push(`${rel}:${sha256(body)}`);
  }
  return {
    files,
    missing,
    hash: sha256(parts.join("\n")),
  };
}

function requestText(urlString) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlString);
    const lib = u.protocol === "https:" ? https : http;
    const req = lib.request(
      urlString,
      {
        method: "GET",
        timeout: requestTimeoutMs,
        headers: { "user-agent": "BossMind-runtime-sync/2.0", "accept-language": "en,fr" },
      },
      (res) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          body += chunk;
          if (body.length > 3_000_000) req.destroy(new Error("response too large"));
        });
        res.on("end", () =>
          resolve({ status: res.statusCode || 0, body, headers: res.headers || {} })
        );
      }
    );
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", reject);
    req.end();
  });
}

async function followHtml(originBase, first) {
  const loc = String(first.headers.location || "");
  if ([301, 302, 307, 308].includes(first.status) && loc) {
    return requestText(new URL(loc, originBase).toString());
  }
  return first;
}

function markersPass(body, markers) {
  return markers.every((s) => body.includes(s));
}

async function runtimeProbe(markers) {
  const [homeRaw, frRaw, client] = await Promise.all([
    requestText(`${origin}/`),
    requestText(`${origin}/?lang=fr`),
    requestText(`${origin}/client`),
  ]);

  const home = await followHtml(origin, homeRaw);
  const fr = await followHtml(origin, frRaw);

  const requiredSnippets = markers;
  const homeOk =
    home.status === 200 &&
    markersPass(home.body, requiredSnippets) &&
    home.body.includes("</html>");
  const frOk =
    fr.status === 200 &&
    fr.body.includes("</html>") &&
    (fr.body.includes("rs-lang-switcher") || fr.body.includes("rs-lang"));
  const redirectLocation = String(client.headers.location || "");
  const clientRedirectOk =
    ([301, 302, 307, 308].includes(client.status) && redirectLocation.endsWith("/")) ||
    (client.status === 200 && markersPass(client.body, requiredSnippets));

  const pricingOnlyTrap =
    home.body.includes('id="pricing"') &&
    !home.body.includes('id="home-intake"');

  return {
    homeInitialStatus: homeRaw.status,
    homeStatus: home.status,
    frStatus: fr.status,
    homeOk,
    frOk,
    clientStatus: client.status,
    clientLocation: redirectLocation,
    clientRedirectOk,
    pricingOnlyTrap,
    ok: homeOk && frOk && clientRedirectOk && !pricingOnlyTrap,
  };
}

function runCmd(command, args) {
  const isWin = process.platform === "win32";
  const bin = command === "npm" && isWin ? "npm.cmd" : command;
  const out = spawnSync(bin, args, { cwd: root, stdio: "pipe", encoding: "utf8", shell: false });
  return {
    ok: out.status === 0,
    code: out.status ?? 1,
    stdout: out.stdout || "",
    stderr: out.stderr || "",
  };
}

async function healRuntime(neonApi, context, markers) {
  const actions = [];
  actions.push({ step: "clean_next_cache", result: runCmd("node", ["scripts/clean-next-cache.mjs"]) });
  let probeAfter = await runtimeProbe(markers).catch((e) => ({ ok: false, error: e.message }));
  if (!probeAfter.ok) {
    actions.push({ step: "build", result: runCmd("npm", ["run", "build"]) });
    probeAfter = await runtimeProbe(markers).catch((e) => ({ ok: false, error: e.message }));
  }
  const healed = Boolean(probeAfter.ok);
  if (neonApi) {
    await neonApi.saveEvent({
      projectKey,
      eventType: "bossmind.runtime_sync.heal",
      severity: healed ? "info" : "error",
      source: "bossmind-runtime-sync",
      eventKey: `heal_${Date.now()}`,
      payload: {
        context,
        actions: actions.map((a) => ({ step: a.step, ok: a.result.ok, code: a.result.code })),
        probeAfter,
      },
    });
    await neonApi.upsertTaskState({
      projectKey,
      taskKey: "bossmind_runtime_sync",
      status: healed ? "healthy" : "degraded",
      assignedAgent: "runtime-sync",
      payload: {
        probeAfter,
        healedAt: new Date().toISOString(),
        compositeScore: context.scores?.compositeAutonomyScore,
      },
    });
    await neonApi.saveDeploymentHistory({
      projectKey,
      commitHash: context.gitHead || "",
      status: healed ? "runtime_healed" : "runtime_heal_failed",
      summary: healed
        ? "Runtime drift auto-healed (cache clean [+ rebuild])."
        : "Runtime drift detected; heal attempt failed.",
      environment: process.env.NODE_ENV === "production" ? "production" : "development",
      metadata: { origin, scores: context.scores },
    });
  }
  return { healed, actions, probeAfter };
}

async function promoteAuthority(neonApi, fingerprint, gitHead, scores, structural, probe) {
  if (!promoteOnVerify || dryRun || !neonApi || !structural?.ok) return false;
  await neonApi.upsertRuntimeAuthority({
    projectKey,
    authorityKey,
    commitHash: gitHead,
    baselineHash: fingerprint.hash,
    routePath: "/",
    source: "bossmind-runtime-sync",
    payload: {
      mode: "verified_lock",
      lockedAt: new Date().toISOString(),
      scores,
      structural,
      probeKeys: { homeOk: probe.homeOk, frOk: probe.frOk, clientOk: probe.clientRedirectOk },
      gitHead,
    },
  });
  return true;
}

async function syncOnce() {
  const now = new Date().toISOString();
  const gitHead = getGitHead();
  const markersCfg = loadAuthorityMarkers();
  const structural = structuralAuthorityReport(root);
  const fingerprint = computeBaselineFingerprint();
  const neonApi = require(path.join(root, "lib/shared/neon-memory.js"));
  const neonInit = await neonApi.initializeSharedMemory();
  const neonEnabled = Boolean(neonInit?.enabled);
  const continuePoint = await loadContinuePoint({
    neon: neonApi,
    projectKey,
    checkpointKey: "global_continuity",
  });

  let authority = null;
  if (neonEnabled) {
    authority = await neonApi.getRuntimeAuthority({ projectKey, authorityKey });
    if (!authority && lockOnStart && !dryRun) {
      await neonApi.upsertRuntimeAuthority({
        projectKey,
        authorityKey,
        commitHash: gitHead,
        baselineHash: fingerprint.hash,
        routePath: "/",
        source: "bossmind-runtime-sync",
        payload: {
          files: fingerprint.files,
          seededAt: now,
          mode: "auto_seed",
          structuralOk: structural.ok,
        },
      });
      authority = await neonApi.getRuntimeAuthority({ projectKey, authorityKey });
    }
  }

  const probe = await runtimeProbe(markersCfg.requiredHomeHtmlMarkers).catch((error) => ({
    ok: false,
    error: error.message,
    homeOk: false,
    frOk: false,
    clientRedirectOk: false,
    pricingOnlyTrap: false,
  }));

  const authorityHashMatches =
    !authority || !authority.baseline_hash || authority.baseline_hash === fingerprint.hash;

  let scores = computeAutonomyScores({
    probeOk: probe.ok,
    neonEnabled,
    authorityHashMatches: Boolean(authorityHashMatches),
    structuralOk: structural.ok,
    hasAuthority: Boolean(authority),
    healSucceeded: false,
  });

  const drift = {
    authorityMissing: neonEnabled && !authority,
    baselineHashMismatch: Boolean(authority && authority.baseline_hash !== fingerprint.hash),
    missingProtectedFiles: fingerprint.missing.length > 0,
    runtimeMismatch: !probe.ok,
    structuralViolation: !structural.ok,
    pricingOnlyHome: Boolean(probe.pricingOnlyTrap),
  };

  const needsHeal =
    drift.authorityMissing ||
    drift.missingProtectedFiles ||
    drift.runtimeMismatch ||
    drift.structuralViolation ||
    drift.pricingOnlyHome;

  let heal = null;
  let healSucceeded = false;
  if (needsHeal && autoHeal && !dryRun) {
    heal = await healRuntime(
      neonEnabled ? neonApi : null,
      { gitHead, fingerprintHash: fingerprint.hash, drift, probe, scores },
      markersCfg.requiredHomeHtmlMarkers
    );
    healSucceeded = Boolean(heal?.healed);
    const probe2 = heal?.probeAfter || probe;
    scores = computeAutonomyScores({
      probeOk: probe2.ok,
      neonEnabled,
      authorityHashMatches: Boolean(authorityHashMatches),
      structuralOk: structural.ok,
      hasAuthority: Boolean(authority),
      healSucceeded,
    });
  }

  const finalProbe = heal?.probeAfter || probe;

  const hasDriftLive = Boolean(
    drift.missingProtectedFiles ||
      drift.structuralViolation ||
      drift.pricingOnlyHome ||
      !finalProbe.ok ||
      drift.authorityMissing ||
      drift.baselineHashMismatch
  );

  const reconciliation = await buildReconciliationSnapshot({
    cwd: root,
    neonApi: neonEnabled ? neonApi : null,
    projectKey,
    authorityKey,
    checkpointKey: "global_continuity",
    liveSyncPayload: {
      probe: finalProbe,
      fingerprint: { hash: fingerprint.hash },
      hasDrift: hasDriftLive,
      ts: now,
      gitHead,
    },
  });
  persistReconciliation(root, reconciliation);

  const matchesPrePromote =
    !authority?.baseline_hash || authority.baseline_hash === fingerprint.hash;

  scores = computeAutonomyScores({
    probeOk: finalProbe.ok,
    neonEnabled,
    authorityHashMatches: matchesPrePromote,
    structuralOk: structural.ok,
    hasAuthority: Boolean(authority),
    healSucceeded,
    reconcileScore: reconciliation.score,
    probeUnreachable: Boolean(reconciliation.signals?.probeUnreachable),
  });

  if (neonEnabled && !dryRun && finalProbe.ok && structural.ok && promoteOnVerify && reconciliation.ok) {
    await promoteAuthority(neonApi, fingerprint, gitHead, scores, structural, finalProbe);
    authority = await neonApi.getRuntimeAuthority({ projectKey, authorityKey });
  }

  const matchesAfterPromote = !authority?.baseline_hash || authority.baseline_hash === fingerprint.hash;

  scores = computeAutonomyScores({
    probeOk: finalProbe.ok,
    neonEnabled,
    authorityHashMatches: matchesAfterPromote,
    structuralOk: structural.ok,
    hasAuthority: Boolean(authority),
    healSucceeded,
    reconcileScore: reconciliation.score,
    probeUnreachable: Boolean(reconciliation.signals?.probeUnreachable),
  });

  const summary = {
    phase: "DetectCompareDiagnoseRepairValidateLock",
    ts: now,
    projectKey,
    origin,
    gitHead,
    neonEnabled,
    authorityKey,
    authority,
    continuePoint: continuePoint?.checkpoint || null,
    continuePointSource: continuePoint?.source || "none",
    fingerprint,
    structural,
    probe: finalProbe,
    drift,
    scores,
    autonomyThreshold: autonomyMin,
    meetsAutonomyTarget: scores.compositeAutonomyScore >= autonomyMin,
    meetsEnterpriseTarget: Number(scores.enterpriseOrchestrationScore || 0) >= autonomyMin,
    autoHeal,
    dryRun,
    heal,
    healSucceeded,
    reconciliation,
  };

  summary.hasDrift = Boolean(
    drift.missingProtectedFiles ||
      drift.structuralViolation ||
      drift.pricingOnlyHome ||
      !finalProbe.ok ||
      drift.authorityMissing ||
      (neonEnabled && !matchesAfterPromote)
  );

  writeStatus(summary);

  if (!summary.hasDrift && finalProbe.ok && structural.ok && !dryRun) {
    await saveContinuePoint({
      neon: neonApi,
      projectKey,
      checkpointKey: "global_continuity",
      commitHash: gitHead,
      baselineHash: fingerprint.hash,
      source: "bossmind-runtime-sync",
      payload: {
        runtimeSync: {
          ts: now,
          scores,
          structuralOk: structural.ok,
          probeOk: finalProbe.ok,
          hasDrift: false,
        },
        authorityHash: authority?.baseline_hash || fingerprint.hash,
      },
    });
  }

  if (neonEnabled) {
    await neonApi.saveEvent({
      projectKey,
      eventType: "bossmind.runtime_sync.cycle",
      severity: summary.hasDrift ? "warn" : "info",
      source: "bossmind-runtime-sync",
      eventKey: `cycle_${Date.now()}`,
      payload: {
        hasDrift: summary.hasDrift,
        drift,
        scores,
        fingerprintHash: fingerprint.hash,
        authorityHash: authority?.baseline_hash || null,
        structuralOk: structural.ok,
        reconciliation,
      },
    });
    await neonApi.upsertTaskState({
      projectKey,
      taskKey: "bossmind_runtime_sync",
      status: summary.hasDrift ? "repairing" : "healthy",
      assignedAgent: "runtime-sync",
      payload: {
        hasDrift: summary.hasDrift,
        scores,
        compositeAutonomyScore: scores.compositeAutonomyScore,
        enterpriseOrchestrationScore: scores.enterpriseOrchestrationScore,
        productionReconciliationScore: scores.productionReconciliationScore,
        reconcileOk: reconciliation?.ok,
        fingerprintHash: fingerprint.hash,
        authorityHash: authority?.baseline_hash || null,
        updatedAt: now,
      },
    });
  }

  const reconcileHook = await notifyReconcileDeployHook(reconciliation);
  if (reconcileHook && !reconcileHook.skipped) {
    summary.reconcileDeployHook = reconcileHook;
  }

  console.log(JSON.stringify(summary, null, 2));
  return summary;
}

async function main() {
  if (once) {
    const out = await syncOnce();
    if (dryRun) {
      const bad = out.fingerprint?.missing?.length > 0 || !out.structural?.ok;
      process.exit(bad ? 1 : 0);
    }
    const bad = out.hasDrift || !out.meetsAutonomyTarget;
    process.exit(bad ? 1 : 0);
  }

  console.log(
    `[bossmind-runtime-sync] v2 active ${projectKey} @ ${origin} interval=${intervalMs}ms authority=${authorityKey}`
  );
  await syncOnce();
  setInterval(() => {
    void syncOnce();
  }, intervalMs);
}

main().catch((error) => {
  console.error("[bossmind-runtime-sync]", error);
  process.exit(1);
});
