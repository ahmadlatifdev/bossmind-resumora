/**
 * BossMind Ultra Anti-Leak — proof-based production deployment safety scoring.
 */
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const { verifyImmutableBaseline } = require("./bossmind-immutable-baseline.js");
const { structuralAuthorityReport } = require("./bossmind-interface-authority.js");
const { buildReconciliationSnapshot, persistReconciliation } = require("./bossmind-reconciliation.js");
const {
  runVisualStructuralValidation,
  compareDeploymentLayers,
  runExtendedDeployGuard,
  restoreGoldenSnapshot,
  runSelfHealPipeline,
  notifyRedeployHook,
} = require("./bossmind-ultra-antileak-extensions.js");

const POLICY_REL = ["config", "bossmind-ultra-antileak-policy.json"];

function loadUltraPolicy(cwd = process.cwd()) {
  const p = path.join(cwd, ...POLICY_REL);
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return { version: 0, targetProductionSafetyPercent: 98, scoreWeights: {} };
  }
}

function sha256File(abs) {
  return crypto.createHash("sha256").update(fs.readFileSync(abs)).digest("hex");
}

function sha256Text(s) {
  return crypto.createHash("sha256").update(String(s), "utf8").digest("hex");
}

function computePathsFingerprint(cwd, relPaths) {
  const parts = [];
  const missing = [];
  for (const rel of relPaths) {
    const abs = path.join(cwd, rel.replace(/\\/g, "/"));
    if (!fs.existsSync(abs)) {
      missing.push(rel);
      continue;
    }
    parts.push(`${rel}:${sha256File(abs)}`);
  }
  return {
    hash: sha256Text(parts.join("\n")),
    missing,
    fileCount: relPaths.length - missing.length,
  };
}

function createImmutableSnapshot(cwd) {
  const id = new Date().toISOString().replace(/[:.]/g, "-");
  const base = path.join(cwd, ".bossmind", "anti-leak", "snapshots", id);
  const policy = loadUltraPolicy(cwd);
  const paths = policy.sourceFingerprintPaths || [];
  const files = [];

  fs.mkdirSync(base, { recursive: true });
  for (const rel of paths) {
    const abs = path.join(cwd, rel);
    if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) continue;
    const dest = path.join(base, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(abs, dest);
    files.push({ relativePath: rel, sha256: sha256File(abs) });
  }

  const manifest = {
    version: 1,
    snapshotId: id,
    createdAt: new Date().toISOString(),
    files,
    aggregateChecksum: sha256Text(files.map((f) => `${f.relativePath}:${f.sha256}`).join("\n")),
    pricingUiMarker: policy.pricingUiMarker,
  };

  fs.writeFileSync(path.join(base, "manifest.json"), JSON.stringify(manifest, null, 2), "utf8");

  const goldenPath = path.join(cwd, ".bossmind", "anti-leak", "golden-snapshot.json");
  fs.mkdirSync(path.dirname(goldenPath), { recursive: true });
  fs.writeFileSync(
    goldenPath,
    JSON.stringify({ ...manifest, path: base.replace(/\\/g, "/") }, null, 2),
    "utf8"
  );

  return { ok: true, snapshotId: id, base, manifest };
}

function verifySnapshotIntegrity(cwd) {
  const goldenPath = path.join(cwd, ".bossmind", "anti-leak", "golden-snapshot.json");
  if (!fs.existsSync(goldenPath)) return { ok: false, reason: "no_golden_snapshot" };
  const golden = JSON.parse(fs.readFileSync(goldenPath, "utf8"));
  const policy = loadUltraPolicy(cwd);
  const live = computePathsFingerprint(cwd, policy.sourceFingerprintPaths || []);
  const match = golden.aggregateChecksum === live.hash;
  return {
    ok: match && !live.missing.length,
    goldenChecksum: golden.aggregateChecksum,
    liveChecksum: live.hash,
    missing: live.missing,
    snapshotId: golden.snapshotId,
  };
}

async function fetchLiveHtml(origin, pathname = "/") {
  const url = `${origin.replace(/\/$/, "")}${pathname}`;
  const res = await fetch(url, {
    headers: { "user-agent": "BossMind-Ultra-AntiLeak/1.0 (+https://resumora.net)" },
    redirect: "follow",
  });
  return { ok: res.ok, status: res.status, url, html: await res.text() };
}

function probeLiveUi(html, policy) {
  const forbidden = (policy.forbiddenLivePatterns || []).map((p) => ({
    pattern: p,
    found: html.includes(p),
  }));
  const required = (policy.requiredLiveMarkers || []).map((m) => ({
    marker: m,
    found: html.includes(m),
  }));
  const tiers = ["basic", "professional", "elite", "essential_advanced"].map((t) => ({
    tier: t,
    found: html.includes(`data-tier="${t}"`),
  }));

  return {
    forbiddenHits: forbidden.filter((x) => x.found),
    requiredMissing: required.filter((x) => !x.found),
    tiers,
    trustRemoved: !html.includes("Trust at a glance") && !html.includes("rs-trust-panel--slim"),
    essentialAdvancedVisible: html.includes("Essential Advanced") && tiers.find((t) => t.tier === "essential_advanced")?.found,
    pricingMarker: html.includes(`data-rs-pricing-ui="${policy.pricingUiMarker || ""}"`),
    pass:
      !forbidden.some((x) => x.found) &&
      !required.some((x) => !x.found) &&
      tiers.every((t) => t.found),
  };
}

function validateCachePolicy(cwd) {
  const swPath = path.join(cwd, "public", "sw.js");
  if (!fs.existsSync(swPath)) return { ok: false, reason: "missing_sw" };
  const sw = fs.readFileSync(swPath, "utf8");
  const brandingPath = path.join(cwd, "config", "branding-asset-version.json");
  let brandingVersion = "";
  try {
    brandingVersion = JSON.parse(fs.readFileSync(brandingPath, "utf8")).version || "";
  } catch {
    /* ignore */
  }
  const checks = {
    networkFirstHtml: sw.includes("isHtmlNavigation"),
    noHomePrecache: !sw.includes('"/",'),
    skipWaiting: sw.includes("skipWaiting"),
    clientsClaim: sw.includes("clients.claim"),
    brandingVersionInSw: brandingVersion ? sw.includes(brandingVersion) : false,
  };
  const passCount = Object.values(checks).filter(Boolean).length;
  return {
    ok: checks.networkFirstHtml && checks.noHomePrecache,
    checks,
    score: Math.round((passCount / Object.keys(checks).length) * 100),
  };
}

function validatePwaPopupSafety(cwd) {
  const p = path.join(cwd, "components/marketing/InstallPrompt.jsx");
  if (!fs.existsSync(p)) return { ok: false, reason: "missing_install_prompt" };
  const body = fs.readFileSync(p, "utf8");
  const checks = {
    cornerBannerClass: body.includes("rs-install-banner"),
    delayedTrigger: body.includes("DELAY_MS") || body.includes("45_000"),
    pricingSectionGuard: body.includes('getElementById("pricing")') || body.includes("#pricing"),
    checkoutPathGuard: body.includes("/pricing"),
  };
  const passCount = Object.values(checks).filter(Boolean).length;
  return {
    ok: checks.delayedTrigger && checks.pricingSectionGuard,
    checks,
    score: Math.round((passCount / Object.keys(checks).length) * 100),
  };
}

function runSpawnStep(root, scriptRel, args = []) {
  const full = path.join(root, scriptRel);
  const res = spawnSync(process.execPath, [full, ...args], {
    cwd: root,
    encoding: "utf8",
    stdio: "pipe",
    maxBuffer: 16 * 1024 * 1024,
  });
  return {
    ok: (res.status ?? 1) === 0,
    code: res.status ?? 1,
    stderrTail: (res.stderr || "").slice(-2000),
    stdoutTail: (res.stdout || "").slice(-2000),
  };
}

function runDeployGuard(root, { skipBuild = false } = {}) {
  const steps = [];
  if (process.env.BOSSMIND_SKIP_ANTILEAK === "1" || process.env.BOSSMIND_ULTRA_SKIP_ANTILEAK === "1") {
    steps.push({ id: "antileak", ok: true, skipped: true });
  } else {
    steps.push({ id: "antileak", ...runSpawnStep(root, "scripts/bossmind-antileak-guard.mjs") });
  }
  steps.push({ id: "protected_surface", ...runSpawnStep(root, "scripts/bossmind-protected-surface-verify.mjs") });
  if (!skipBuild && process.env.BOSSMIND_ULTRA_SKIP_BUILD !== "1") {
    const build = spawnSync(process.platform === "win32" ? "npm.cmd" : "npm", ["run", "build"], {
      cwd: root,
      encoding: "utf8",
      stdio: "pipe",
      shell: process.platform === "win32",
    });
    steps.push({
      id: "build",
      ok: (build.status ?? 1) === 0,
      code: build.status ?? 1,
      stderrTail: (build.stderr || "").slice(-2000),
    });
  }
  const structural = structuralAuthorityReport(root);
  steps.push({ id: "structural_authority", ok: structural.ok, detail: structural });
  return {
    ok: steps.every((s) => s.ok),
    steps,
  };
}

function pctFromChecks(checks) {
  if (!checks.length) return 0;
  return Math.round((checks.filter((c) => c.pass).length / checks.length) * 1000) / 10;
}

/**
 * @param {{ cwd?: string, origin?: string, skipBuild?: boolean, createSnapshot?: boolean, selfHeal?: boolean, restoreGolden?: boolean }} opts
 */
async function runUltraAntiLeak(opts = {}) {
  const cwd = opts.cwd || process.cwd();
  const policy = loadUltraPolicy(cwd);
  const origin = (opts.origin || process.env.BOSSMIND_REALITY_LIVE_URL || policy.productionOrigin || "").replace(
    /\/$/,
    ""
  );

  let snapshot = { ok: false, skipped: !opts.createSnapshot };
  if (opts.createSnapshot) snapshot = createImmutableSnapshot(cwd);

  const sourceFp = computePathsFingerprint(cwd, policy.sourceFingerprintPaths || []);
  const snapshotIntegrity = verifySnapshotIntegrity(cwd);
  const imm = verifyImmutableBaseline(cwd);
  const cache = validateCachePolicy(cwd);
  const pwa = validatePwaPopupSafety(cwd);
  const deployGuard = runDeployGuard(cwd, { skipBuild: opts.skipBuild });
  const extendedDeployGuard = runExtendedDeployGuard(cwd);

  let selfHeal = { skipped: true };
  if (opts.selfHeal) {
    selfHeal = await runSelfHealPipeline(cwd, origin, { restoreSnapshot: Boolean(opts.restoreGolden) });
  }

  let liveHome = { ok: false, skipped: !origin };
  let livePricing = { ok: false, skipped: !origin };
  let liveProbe = null;
  if (origin) {
    liveHome = await fetchLiveHtml(origin, "/");
    livePricing = await fetchLiveHtml(origin, "/pricing");
    liveProbe = {
      home: probeLiveUi(liveHome.html || "", policy),
      pricing: probeLiveUi(livePricing.html || "", policy),
    };
  }

  const reconciliation = await buildReconciliationSnapshot({ cwd });
  persistReconciliation(cwd, reconciliation);

  let visual = { pass: false, skipped: true };
  let deploymentLayers = null;
  if (origin && liveProbe) {
    visual = runVisualStructuralValidation(liveHome.html || "", livePricing.html || "", policy);
    deploymentLayers = compareDeploymentLayers(
      cwd,
      sourceFp.hash,
      visual.homeDomHash,
      origin
    );
  }

  const sourceVsLiveMatch =
    !origin || (liveProbe?.home?.pass && visual.pass && (snapshotIntegrity.ok || !fs.existsSync(path.join(cwd, ".bossmind", "anti-leak", "golden-snapshot.json"))));

  const dimensionChecks = {
    antiLeakActivation: [
      { id: "deploy_checkpoint_script", pass: fs.existsSync(path.join(cwd, "scripts/bossmind-deploy-checkpoint.mjs")) },
      { id: "antileak_guard", pass: deployGuard.steps.find((s) => s.id === "antileak")?.ok !== false },
      { id: "golden_snapshot", pass: snapshot.ok || snapshotIntegrity.ok },
      { id: "restore_engine", pass: fs.existsSync(path.join(cwd, "scripts/bossmind-ultra-antileak-restore.mjs")) },
      { id: "closed_loop_script", pass: fs.existsSync(path.join(cwd, "scripts/bossmind-ultra-antileak-closed-loop.mjs")) },
    ],
    runtimeSynchronization: [
      { id: "live_home_http", pass: liveHome.ok },
      { id: "live_home_ui", pass: liveProbe?.home?.pass === true },
      { id: "live_pricing_ui", pass: liveProbe?.pricing?.pass === true },
      { id: "reconcile_ok", pass: reconciliation.ok === true },
    ],
    deploymentReconciliation: [
      { id: "structural", pass: deployGuard.steps.find((s) => s.id === "structural_authority")?.ok === true },
      { id: "extended_deploy_guard", pass: extendedDeployGuard.ok },
      { id: "reconcile_score", pass: (reconciliation.score || 0) >= 70 },
      { id: "immutable_enabled", pass: !imm.enabled || imm.ok },
      { id: "source_live_match", pass: sourceVsLiveMatch },
    ],
    staleCacheProtection: [
      { id: "sw_policy", pass: cache.ok },
      { id: "branding_version_file", pass: fs.existsSync(path.join(cwd, "config/branding-asset-version.json")) },
      { id: "live_pricing_marker", pass: liveProbe?.home?.pricingMarker || liveProbe?.pricing?.pricingMarker },
    ],
    autonomousRollbackSafety: [
      { id: "snapshot_integrity", pass: snapshotIntegrity.ok },
      { id: "baseline_restore_script", pass: fs.existsSync(path.join(cwd, "scripts/bossmind-baseline-restore.mjs")) },
      { id: "restore_manifest", pass: Boolean(snapshotIntegrity.snapshotId) },
    ],
    uiIntegrityValidation: [
      { id: "trust_removed_live", pass: liveProbe?.home?.trustRemoved !== false },
      { id: "ea_visible", pass: liveProbe?.home?.essentialAdvancedVisible === true },
      { id: "source_trust_stub", pass: fs.readFileSync(path.join(cwd, "components/marketing/sections/TrustMetricsPanel.jsx"), "utf8").includes("return null") },
      { id: "four_tiers", pass: liveProbe?.home?.tiers?.every((t) => t.found) },
      { id: "visual_structural", pass: visual.pass === true },
      { id: "stripe_checkout_path", pass: fs.readFileSync(path.join(cwd, "pages/api/checkout.js"), "utf8").includes("essential_advanced") },
    ],
    pwaPopupSafety: [
      { id: "pwa_checks", pass: pwa.ok },
      { id: "app_sw_update", pass: fs.readFileSync(path.join(cwd, "pages/_app.js"), "utf8").includes("reg.update") },
    ],
  };

  const weights = policy.scoreWeights || {};
  const scores = {};
  let earned = 0;
  let max = 0;
  for (const [key, checks] of Object.entries(dimensionChecks)) {
    const w = weights[key] || 0;
    max += w;
    const dimPct = pctFromChecks(checks);
    scores[key] = { percent: dimPct, weight: w, checks };
    earned += (w * dimPct) / 100;
  }

  const overallProductionSafetyPercent = max ? Math.round((earned / max) * 1000) / 10 : 0;
  const target = policy.targetProductionSafetyPercent || 98;

  const repairActions = [];
  if (!liveProbe?.home?.trustRemoved) repairActions.push("Purge PWA cache / deploy latest; trust block still in HTML");
  if (!liveProbe?.home?.essentialAdvancedVisible) repairActions.push("Deploy commit with Essential Advanced + set Stripe price env");
  if (!cache.ok) repairActions.push("Fix public/sw.js network-first HTML policy");
  if (!deployGuard.ok) repairActions.push("Resolve deploy-guard failures before ship");
  if (imm.enabled && !imm.ok) repairActions.push("Re-seal immutable baseline: npm run bossmind:baseline:seal (after approved UI)");
  if (!snapshotIntegrity.ok) repairActions.push("Create golden snapshot: npm run bossmind:ultra:antileak:snapshot-lock");
  if (overallProductionSafetyPercent < target) {
    repairActions.push(`Overall ${overallProductionSafetyPercent}% < target ${target}% — deploy Render + run bossmind:deploy:gate`);
  }
  if (!sourceVsLiveMatch && origin) {
    repairActions.push("Source/live mismatch — run npm run bossmind:ultra:antileak:self-heal or deploy latest commit");
  }

  let redeployHook = { skipped: true };
  if (origin && overallProductionSafetyPercent < target) {
    redeployHook = await notifyRedeployHook(origin, "ultra_antileak_below_target");
  }

  const report = {
    generatedAt: new Date().toISOString(),
    policyVersion: policy.version,
    targetProductionSafetyPercent: target,
    overallProductionSafetyPercent,
    meetsTarget: overallProductionSafetyPercent >= target,
    origin: origin || null,
    snapshot,
    snapshotIntegrity,
    sourceFingerprint: sourceFp,
    immutableBaseline: { enabled: imm.enabled, ok: imm.ok },
    cachePolicy: cache,
    pwaPopupSafety: pwa,
    deployGuard,
    extendedDeployGuard,
    visualStructural: visual,
    deploymentLayers,
    sourceVsLiveMatch,
    selfHeal,
    redeployHook,
    live: liveProbe,
    reconciliation: { ok: reconciliation.ok, score: reconciliation.score, mismatches: reconciliation.mismatches?.length || 0 },
    dimensionScores: scores,
    rates: {
      antiLeakActivationRate: scores.antiLeakActivation?.percent ?? 0,
      runtimeSynchronizationRate: scores.runtimeSynchronization?.percent ?? 0,
      deploymentReconciliationRate: scores.deploymentReconciliation?.percent ?? 0,
      staleCacheProtectionRate: scores.staleCacheProtection?.percent ?? 0,
      autonomousRollbackSafetyRate: scores.autonomousRollbackSafety?.percent ?? 0,
      uiIntegrityValidationRate: scores.uiIntegrityValidation?.percent ?? 0,
      pwaPopupSafetyRate: scores.pwaPopupSafety?.percent ?? 0,
    },
    repairActions,
    closedLoop: {
      stages: policy.closedLoopStages || [],
      completed: [
        snapshot.ok ? "immutable_snapshot" : null,
        deployGuard.steps.find((s) => s.id === "build")?.ok ? "build_validation" : null,
        deployGuard.ok ? "deploy_guard" : null,
        extendedDeployGuard.ok ? "extended_deploy_guard" : null,
        liveProbe?.home?.pass ? "live_ui_probe" : null,
        visual.pass ? "visual_structural_validation" : null,
        cache.ok ? "cache_policy" : null,
        reconciliation.ok ? "reconciliation" : null,
        selfHeal.ok ? "self_heal" : null,
      ].filter(Boolean),
    },
    disclaimer:
      "Scores are proof-based from in-repo checks + live HTML fetch. Auto-redeploy/CDN purge require external hooks (Render/CI). Pixel screenshot diff uses structural HTML signals (not Playwright pixels).",
  };

  return report;
}

async function lockUltraAntiLeakState(report, cwd = process.cwd()) {
  const policy = loadUltraPolicy(cwd);
  const payload = {
    lockedAt: new Date().toISOString(),
    memoryType: "BOSSMIND_ULTRA_ANTILEAK_GOLDEN",
    overallProductionSafetyPercent: report.overallProductionSafetyPercent,
    meetsTarget: report.meetsTarget,
    sourceFingerprint: report.sourceFingerprint?.hash,
    goldenSnapshotId: report.snapshotIntegrity?.snapshotId,
    pricingUiMarker: policy.pricingUiMarker,
    dimensionScores: Object.fromEntries(
      Object.entries(report.dimensionScores || {}).map(([k, v]) => [k, v.percent])
    ),
  };

  const localPath = path.join(cwd, ".bossmind", "anti-leak", "latest-ultra-lock.json");
  fs.mkdirSync(path.dirname(localPath), { recursive: true });
  fs.writeFileSync(localPath, JSON.stringify(payload, null, 2), "utf8");

  let neon = { ok: false, reason: "NEON_DATABASE_URL unset" };
  try {
    const neonMod = require("../shared/neon-memory.js");
    await neonMod.ensureSharedMemoryInitialized().catch(() => {});
    const sql = neonMod.getSqlClient();
    if (sql) {
      const projectKey = process.env.BOSSMIND_PROJECT_KEY || "resumora";
      const memoryKey = "bossmind:ultra_antileak_golden";
      await sql`
        INSERT INTO automation_memory (project_key, memory_key, payload, updated_at)
        VALUES (${projectKey}, ${memoryKey}, ${JSON.stringify(payload)}::jsonb, NOW())
        ON CONFLICT (project_key, memory_key) DO UPDATE SET
          payload = EXCLUDED.payload,
          updated_at = NOW()
      `;
      await neonMod.saveEvent({
        projectKey,
        eventType: "bossmind.ultra_antileak.locked",
        severity: report.meetsTarget ? "info" : "warning",
        source: "bossmind-ultra-antileak",
        eventKey: `ultra:${payload.lockedAt}`,
        payload: { overallProductionSafetyPercent: payload.overallProductionSafetyPercent },
      });
      neon = { ok: true, projectKey, memoryKey };
    }
  } catch (e) {
    neon = { ok: false, error: e.message || String(e) };
  }

  return { localPath: localPath.replace(/\\/g, "/"), neon, payload };
}

function readLatestUltraReport(cwd = process.cwd()) {
  const p = path.join(cwd, ".bossmind", "anti-leak", "latest-ultra-lock.json");
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return null;
  }
}

module.exports = {
  loadUltraPolicy,
  createImmutableSnapshot,
  verifySnapshotIntegrity,
  restoreGoldenSnapshot,
  computePathsFingerprint,
  probeLiveUi,
  validateCachePolicy,
  validatePwaPopupSafety,
  runDeployGuard,
  runExtendedDeployGuard,
  runSelfHealPipeline,
  runUltraAntiLeak,
  lockUltraAntiLeakState,
  readLatestUltraReport,
};
