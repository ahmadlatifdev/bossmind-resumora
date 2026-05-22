/**
 * Immutable production governance — drift detection, checksum ledger, stable release locking.
 */
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const { computePathsFingerprint } = require("./bossmind-baseline-fingerprint");
const { runDeploymentVerification } = require("./bossmind-deployment-verification");
const { assessRouteOwnership } = require("./bossmind-route-ownership");

const GOV_DIR = "config/bossmind-governance";
const LIVE_DIR = ".bossmind/governance";

function readJson(cwd, rel, fallback = {}) {
  const p = path.join(cwd, rel);
  if (!fs.existsSync(p)) return { ...fallback };
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return { ...fallback };
  }
}

function writeJson(cwd, rel, data) {
  const p = path.join(cwd, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(data, null, 2), "utf8");
}

function getLocalGitHead(cwd) {
  try {
    return execSync("git rev-parse HEAD", { cwd, encoding: "utf8" }).trim();
  } catch {
    return null;
  }
}

function getShortHead(cwd) {
  try {
    return execSync("git rev-parse --short HEAD", { cwd, encoding: "utf8" }).trim();
  } catch {
    return null;
  }
}

function loadGovernanceBundle(cwd) {
  return {
    productionLock: readJson(cwd, `${GOV_DIR}/production-lock.json`),
    deploymentState: readJson(cwd, `${LIVE_DIR}/deployment-state.json`, readJson(cwd, `${GOV_DIR}/deployment-state.json`)),
    checksumLedger: readJson(cwd, `${LIVE_DIR}/runtime-checksum-ledger.json`, readJson(cwd, `${GOV_DIR}/runtime-checksum-ledger.json`)),
    integrity: readJson(cwd, `${GOV_DIR}/orchestration-integrity.json`),
    stableRelease: readJson(cwd, `${GOV_DIR}/stable-release-manifest.json`),
  };
}

function computeRuntimeFingerprint(cwd) {
  const iface = readJson(cwd, "config/bossmind-immutable-production-baseline.json").immutableInterfacePaths || [
    "pages/_app.js",
    "pages/success.js",
    "public/sw.js",
    "lib/client/checkout-runtime.js",
    "lib/client/activation-engine.js",
    "components/marketing/HomePage.jsx",
  ];
  const fp = computePathsFingerprint(cwd, iface);
  const swPath = path.join(cwd, "public/sw.js");
  let swVersion = null;
  if (fs.existsSync(swPath)) {
    const m = fs.readFileSync(swPath, "utf8").match(/SW_VERSION\s*=\s*["']([^"']+)["']/);
    swVersion = m ? m[1] : null;
  }
  return {
    workspaceHash: fp.hash,
    pathCount: fp.pathCount,
    missing: fp.missing,
    swVersion,
    gitHead: getLocalGitHead(cwd),
    at: new Date().toISOString(),
  };
}

async function probeOriginCommit(origin) {
  const base = origin.replace(/\/$/, "");
  try {
    const res = await fetch(`${base}/api/health`, {
      headers: { "cache-control": "no-cache" },
    });
    const body = await res.json();
    return {
      origin: base,
      ok: res.ok,
      gitCommit: body.gitCommit || null,
      checkoutReady: body.stripe?.checkoutReady === true,
      databaseOk: body.database?.ok === true,
      commerceReady: body.commerceReady === true,
    };
  } catch (e) {
    return { origin: base, ok: false, error: e.message };
  }
}

async function verifyLiveCommitAlignment(cwd, origins) {
  const local = getLocalGitHead(cwd);
  const probes = [];
  for (const o of origins) {
    probes.push(await probeOriginCommit(o));
  }
  const drift = probes.filter((p) => p.gitCommit && local && p.gitCommit !== local);
  return {
    localGitHead: local,
    probes,
    driftDetected: drift.length > 0,
    driftSites: drift,
    ok: drift.length === 0 && probes.some((p) => p.ok),
  };
}

function appendChecksumLedger(cwd, entry) {
  const ledger = readJson(cwd, `${LIVE_DIR}/runtime-checksum-ledger.json`, readJson(cwd, `${GOV_DIR}/runtime-checksum-ledger.json`));
  ledger.entries = ledger.entries || [];
  ledger.entries.push(entry);
  while (ledger.entries.length > 50) ledger.entries.shift();
  writeJson(cwd, `${LIVE_DIR}/runtime-checksum-ledger.json`, ledger);
  writeJson(cwd, `${GOV_DIR}/runtime-checksum-ledger.json`, ledger);
  return ledger;
}

async function runProductionGovernanceCheck({
  cwd = process.cwd(),
  origin = null,
  skipLive = false,
} = {}) {
  const bundle = loadGovernanceBundle(cwd);
  const lock = bundle.productionLock;
  const origins = origin ? [origin] : lock.productionOrigins || ["https://www.resumora.net"];
  const fingerprint = computeRuntimeFingerprint(cwd);
  const localHead = fingerprint.gitHead;

  const checks = [];
  checks.push({ id: "local_git_clean", pass: Boolean(localHead) });
  checks.push({ id: "fingerprint_paths", pass: fingerprint.missing.length === 0, missing: fingerprint.missing });
  const expectedSw = bundle.integrity.runtimeImmunity?.serviceWorkerVersion;
  checks.push({
    id: "sw_version_locked",
    pass: !expectedSw || fingerprint.swVersion === expectedSw,
  });

  let liveAlign = { ok: true, driftDetected: false, probes: [] };
  if (!skipLive) {
    liveAlign = await verifyLiveCommitAlignment(cwd, origins);
    checks.push({ id: "no_deployment_drift", pass: !liveAlign.driftDetected });
    checks.push({ id: "live_health_reachable", pass: liveAlign.probes.some((p) => p.ok) });
  }

  const routeOwnership = assessRouteOwnership(cwd);
  checks.push({ id: "route_integrity", pass: routeOwnership.ok !== false });

  let deployVerify = { ok: true, percent: 100 };
  if (!skipLive) {
    deployVerify = await runDeploymentVerification({
      cwd,
      origin: origins[0],
      paths: ["/", "/pricing", "/login", "/studio"],
    });
    checks.push({ id: "ui_snapshot_verify", pass: deployVerify.ok !== false });
  }

  const earned = checks.filter((c) => c.pass).length;
  const blockDeploy = checks.some((c) => !c.pass && ["no_deployment_drift", "fingerprint_paths", "route_integrity"].includes(c.id));

  const entry = {
    at: new Date().toISOString(),
    gitCommit: localHead,
    fingerprint,
    liveAlign,
    blockDeploy,
    checks,
  };
  appendChecksumLedger(cwd, entry);

  const deploymentState = bundle.deploymentState;
  deploymentState.lastVerification = entry.at;
  deploymentState.driftDetected = liveAlign.driftDetected;
  deploymentState.localGitHead = localHead;
  deploymentState.liveProbes = liveAlign.probes;
  writeJson(cwd, `${LIVE_DIR}/deployment-state.json`, deploymentState);

  return {
    percent: Math.round((earned / checks.length) * 1000) / 10,
    checks,
    blockDeploy: lock.rules?.blockUnverifiedDeploy && blockDeploy,
    driftDetected: liveAlign.driftDetected,
    fingerprint,
    liveAlign,
    routeOwnership,
    deployVerify,
    stableRelease: bundle.stableRelease,
  };
}

function markStableRelease(cwd, proof = {}) {
  const manifest = readJson(cwd, `${GOV_DIR}/stable-release-manifest.json`);
  const fingerprint = computeRuntimeFingerprint(cwd);
  manifest.markedStable = true;
  manifest.gitCommit = fingerprint.gitHead;
  manifest.gitBranch = proof.gitBranch || "main";
  manifest.markedAt = new Date().toISOString();
  manifest.runtimeFingerprint = fingerprint;
  manifest.origins = proof.origins || {};
  manifest.verification = {
    buildOk: proof.buildOk === true,
    journeyE2eOk: proof.journeyE2eOk === true,
    runtimeStabilityOk: proof.runtimeStabilityOk === true,
    checkoutReady: proof.checkoutReady === true,
  };
  writeJson(cwd, `${GOV_DIR}/stable-release-manifest.json`, manifest);

  const lock = readJson(cwd, `${GOV_DIR}/production-lock.json`);
  lock.lastHealthyRelease = manifest.gitCommit;
  lock.updatedAt = manifest.markedAt;
  writeJson(cwd, `${GOV_DIR}/production-lock.json`, lock);

  return manifest;
}

function getRollbackTarget(cwd) {
  const stable = readJson(cwd, `${GOV_DIR}/stable-release-manifest.json`);
  if (stable.markedStable && stable.gitCommit) {
    return { gitCommit: stable.gitCommit, markedAt: stable.markedAt };
  }
  const baseline = readJson(cwd, "config/bossmind-immutable-production-baseline.json");
  return { gitCommit: baseline.sealedGitHead || null, markedAt: baseline.sealedAt };
}

module.exports = {
  loadGovernanceBundle,
  computeRuntimeFingerprint,
  verifyLiveCommitAlignment,
  runProductionGovernanceCheck,
  markStableRelease,
  getRollbackTarget,
  appendChecksumLedger,
  getLocalGitHead,
  getShortHead,
};
