/**
 * Neon + local checkpoint integrity — detect stale overwrite / corruption.
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { computePathsFingerprint } = require("./bossmind-ultra-antileak-lib");

function sha256File(abs) {
  return crypto.createHash("sha256").update(fs.readFileSync(abs)).digest("hex");
}

async function assessMemoryIntegrity({ cwd = process.cwd(), neonApi, projectKey = "resumora" } = {}) {
  const fingerprintPaths = [
    "components/marketing/HomePage.jsx",
    "components/marketing/sections/PricingPanel.jsx",
    "lib/marketing/site-copy.js",
    "config/bossmind-protected-ui-authority.json",
  ];
  const fp = computePathsFingerprint(cwd, fingerprintPaths);
  const localCpPath = path.join(cwd, ".bossmind", "checkpoints", "latest-ui-fingerprint.json");
  let localCp = null;
  try {
    if (fs.existsSync(localCpPath)) localCp = JSON.parse(fs.readFileSync(localCpPath, "utf8"));
  } catch {
    localCp = null;
  }

  let neonCp = null;
  if (neonApi?.enabled && neonApi.getLastConfirmedCheckpoint) {
    try {
      neonCp = await neonApi.getLastConfirmedCheckpoint({
        projectKey,
        checkpointKey: "ui_runtime_fingerprint",
      });
    } catch {
      neonCp = null;
    }
  }

  const neonHash = neonCp?.payload?.hash || neonCp?.baseline_hash || null;
  const localHash = localCp?.hash || null;
  const driftFromNeon = neonHash && neonHash !== fp.hash;
  const driftFromLocal = localHash && localHash !== fp.hash;

  const checks = [
    { id: "fingerprint_computed", pass: Boolean(fp.hash) && fp.missing.length === 0 },
    { id: "local_checkpoint_present", pass: Boolean(localHash) },
    { id: "neon_checkpoint_or_optional", pass: !neonApi?.enabled || Boolean(neonHash) },
    { id: "no_neon_drift", pass: !driftFromNeon },
    { id: "no_local_drift", pass: !driftFromLocal },
  ];

  if (!localHash && fp.hash) {
    fs.mkdirSync(path.dirname(localCpPath), { recursive: true });
    fs.writeFileSync(
      localCpPath,
      JSON.stringify({ hash: fp.hash, sealedAt: new Date().toISOString(), paths: fingerprintPaths }, null, 2),
      "utf8"
    );
    checks.find((c) => c.id === "local_checkpoint_present").pass = true;
  }

  if (neonApi?.enabled && neonApi.upsertLastConfirmedCheckpoint && fp.hash && !driftFromNeon) {
    try {
      await neonApi.upsertLastConfirmedCheckpoint({
        projectKey,
        checkpointKey: "ui_runtime_fingerprint",
        baselineHash: fp.hash,
        payload: { hash: fp.hash, paths: fingerprintPaths, sealedAt: new Date().toISOString() },
        source: "bossmind-memory-integrity",
      });
    } catch {
      /* ignore */
    }
  }

  const earned = checks.filter((c) => c.pass).length;
  return {
    percent: Math.round((earned / checks.length) * 1000) / 10,
    checks,
    currentHash: fp.hash,
    neonHash,
    localHash,
    missingPaths: fp.missing,
    staleOverwriteRisk: driftFromNeon || driftFromLocal,
  };
}

module.exports = { assessMemoryIntegrity };
