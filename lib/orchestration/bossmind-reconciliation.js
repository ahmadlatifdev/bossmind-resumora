/**
 * Production reconciliation — compares Git / build / memory authority / checkpoints / last sync probes.
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const { structuralAuthorityReport, readBuildIdIfAny } = require("./bossmind-interface-authority");
const { verifyImmutableBaseline } = require("./bossmind-immutable-baseline.js");

function readJson(p) {
  try {
    if (!fs.existsSync(p)) return null;
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return null;
  }
}

function getGitHead(cwd) {
  try {
    return execSync("git rev-parse HEAD", { cwd, encoding: "utf8" }).trim();
  } catch {
    return "";
  }
}

function probeWasUnreachable(syncStatus) {
  const msg = syncStatus?.probe?.error || "";
  return /ECONNREFUSED|ETIMEDOUT|ENOTFOUND/i.test(msg);
}

/**
 * Build full reconciliation snapshot (no network — uses last persisted sync probe when offline).
 */
/** Merge persisted sync file with live in-memory snapshot (live wins when provided). */
function mergeSyncRead(cwd, liveSyncPayload) {
  const syncPath = path.join(cwd, ".bossmind", "runtime-sync", "status.json");
  const disk = readJson(syncPath) || {};
  if (!liveSyncPayload || typeof liveSyncPayload !== "object") return disk;
  return {
    ...disk,
    ...liveSyncPayload,
    probe: liveSyncPayload.probe !== undefined ? liveSyncPayload.probe : disk.probe,
    fingerprint: liveSyncPayload.fingerprint || disk.fingerprint,
    hasDrift: liveSyncPayload.hasDrift !== undefined ? liveSyncPayload.hasDrift : disk.hasDrift,
    ts: liveSyncPayload.ts || disk.ts,
  };
}

async function buildReconciliationSnapshot({
  cwd = process.cwd(),
  neonApi,
  projectKey,
  authorityKey = "luxury_ui_baseline",
  checkpointKey = "global_continuity",
  liveSyncPayload = null,
} = {}) {
  const structural = structuralAuthorityReport(cwd);
  const gitHead = getGitHead(cwd);
  const buildId = readBuildIdIfAny(cwd);
  const syncStatus = mergeSyncRead(cwd, liveSyncPayload);
  const fingerprintHash = syncStatus?.fingerprint?.hash || null;

  let authority = null;
  let checkpoint = null;
  if (neonApi) {
    try {
      authority = await neonApi.getRuntimeAuthority({ projectKey, authorityKey });
    } catch {
      authority = null;
    }
    try {
      checkpoint = await neonApi.getLastConfirmedCheckpoint({ projectKey, checkpointKey });
    } catch {
      checkpoint = null;
    }
  }

  /** @type {Array<{ code: string; severity: string; detail: string }>} */
  const mismatches = [];
  const unreachable = probeWasUnreachable(syncStatus);
  const probeOk = Boolean(syncStatus?.probe?.ok);

  if (!structural.ok) {
    mismatches.push({
      code: "STRUCTURAL_LOCK",
      severity: "critical",
      detail: "Protected luxury layout / HomePage bootstrap invariant failed",
    });
  }

  const imm = verifyImmutableBaseline(cwd);
  if (imm.enabled && !imm.ok) {
    const bits = [];
    if (!imm.luxuryOk) bits.push("luxury_slice");
    if (!imm.workspaceOk) bits.push("full_workspace");
    mismatches.push({
      code: "IMMUTABLE_BASELINE_VIOLATION",
      severity: "critical",
      detail: `Sealed production baseline mismatch (${bits.join("+") || "unknown"}) — deploy blocked until re-seal or BOSSMIND_BASELINE_OVERRIDE`,
    });
  }

  if (neonApi && authority?.baseline_hash && fingerprintHash && authority.baseline_hash !== fingerprintHash) {
    mismatches.push({
      code: "MEMORY_BASELINE_MISMATCH",
      severity: "high",
      detail: `Neon baseline_hash differs from workspace fingerprint (${authority.baseline_hash.slice(0, 10)}…)`,
    });
  }

  const cpCommit =
    checkpoint?.commit_hash ||
    checkpoint?.payload?.runtimeSync?.gitHead ||
    "";

  const strictCp = process.env.BOSSMIND_RECONCILE_STRICT_CHECKPOINT !== "0";
  if (
    strictCp &&
    cpCommit &&
    gitHead &&
    cpCommit !== gitHead
  ) {
    mismatches.push({
      code: "CHECKPOINT_GIT_MISMATCH",
      severity: "medium",
      detail: `Last confirmed commit ${cpCommit.slice(0, 7)} != workspace HEAD ${gitHead.slice(0, 7)}`,
    });
  }

  if (!probeOk) {
    if (unreachable) {
      mismatches.push({
        code: "RUNTIME_UNREACHABLE",
        severity: "low",
        detail: "Local/probed runtime not reachable (dev server stopped or wrong BOSSMIND_MONITOR_ORIGIN)",
      });
    } else {
      mismatches.push({
        code: "RUNTIME_PROBE_FAILED",
        severity: "high",
        detail: "Luxury interface probe failed (stale/minimal markup or routing)",
      });
    }
  }

  const railwaySignal = Boolean(
    process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_ENVIRONMENT_NAME || process.env.RAILWAY_PROJECT_ID
  );
  const renderSignal = Boolean(process.env.RENDER || process.env.RENDER_SERVICE_ID);

  let score = 100;
  for (const m of mismatches) {
    if (m.severity === "critical") score -= 35;
    else if (m.severity === "high") score -= 22;
    else if (m.severity === "medium") score -= 12;
    else score -= 6;
  }
  score = Math.max(0, Math.min(100, Math.round(score)));

  /** Internal blend (distinct from autonomy `enterpriseOrchestrationScore` on the dashboard) */
  const memoryOk =
    !authority ||
    (authority?.baseline_hash && fingerprintHash ? authority.baseline_hash === fingerprintHash : true);

  let alignmentBlend = Math.round(
    (structural.ok ? 32 : 0) +
      (memoryOk ? 28 : 0) +
      (probeOk ? 28 : unreachable ? 18 : 6) +
      (mismatches.filter((x) => x.severity === "low").length === mismatches.length && mismatches.length
        ? 8
        : mismatches.length === 0
          ? 12
          : 0)
  );
  alignmentBlend = Math.max(0, Math.min(100, alignmentBlend));

  return {
    ts: new Date().toISOString(),
    projectKey,
    ok: mismatches.filter((m) => m.severity !== "low").length === 0,
    score,
    alignmentBlend,
    mismatches,
    signals: {
      gitHead,
      buildId,
      fingerprintHash,
      neonAuthorityHash: authority?.baseline_hash || null,
      checkpointCommit: cpCommit || null,
      railwayEnv: railwaySignal,
      renderEnv: renderSignal,
      probeUnreachable: unreachable,
      lastSyncTs: syncStatus?.ts || null,
      immutableBaselineOk: !imm.enabled || imm.ok,
    },
    structuralOk: structural.ok,
    immutableBaseline: imm.enabled
      ? { ok: imm.ok, luxuryOk: imm.luxuryOk, workspaceOk: imm.workspaceOk }
      : null,
  };
}

function persistReconciliation(cwd, snapshot) {
  const dir = path.join(cwd, ".bossmind", "reconciliation");
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "status.json"), JSON.stringify(snapshot, null, 2), "utf8");
  } catch {
    /* ignore */
  }
}

module.exports = {
  buildReconciliationSnapshot,
  probeWasUnreachable,
  persistReconciliation,
  mergeSyncRead,
};
