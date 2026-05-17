/**
 * Immutable design lock execution chain — snapshot load, live compare, enforce, Neon persist.
 */
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const { verifyImmutableBaseline, loadImmutableConfig, getImmutableInterfacePaths } = require("./bossmind-immutable-baseline");
const { computePathsFingerprint } = require("./bossmind-baseline-fingerprint");
const { loadManifest, structuralAuthorityReport } = require("./bossmind-interface-authority");
const { runDeploymentVerification } = require("./bossmind-deployment-verification");
const { assessRouteOwnership } = require("./bossmind-route-ownership");

function loadExecutionConfig(cwd) {
  try {
    return JSON.parse(fs.readFileSync(path.join(cwd, "config/bossmind-immutable-lock-execution.json"), "utf8"));
  } catch {
    return {};
  }
}

function loadSnapshotFingerprint(cwd, snapshotDir, ifacePaths) {
  const snapRoot = path.join(cwd, snapshotDir);
  if (!fs.existsSync(snapRoot)) {
    return { ok: false, reason: "snapshot_dir_missing", hash: null };
  }
  const paths = ifacePaths.map((rel) => {
    const snap = path.join(snapRoot, ...rel.split("/"));
    return fs.existsSync(snap) ? snap : null;
  });
  const existing = ifacePaths.filter((rel) => fs.existsSync(path.join(snapRoot, ...rel.split("/"))));
  const fp = computePathsFingerprint(cwd, existing.map((rel) => path.join(snapshotDir, rel).replace(/\\/g, "/")));
  return { ok: existing.length > 0, hash: fp.hash, missing: fp.missing, pathCount: existing.length };
}

function compareWorkspaceToSnapshot(cwd, lock) {
  const iface = getImmutableInterfacePaths(lock);
  const snapshotDir = lock.snapshotRelativeDir || "config/bossmind-baseline-snapshots/luxury-v1";
  const workspace = computePathsFingerprint(cwd, iface);
  const missingInSnapshot = iface.filter((rel) => !fs.existsSync(path.join(cwd, snapshotDir, ...rel.split("/"))));
  const matchesSealed = workspace.hash === lock.lockedLuxuryInterfaceFingerprint;
  return {
    workspaceHash: workspace.hash,
    sealedHash: lock.lockedLuxuryInterfaceFingerprint,
    snapshotDir,
    snapshotFilesPresent: iface.length - missingInSnapshot.length,
    snapshotFilesMissing: missingInSnapshot,
    matchesSealed,
    ok: matchesSealed && missingInSnapshot.length === 0 && workspace.missing.length === 0,
    missingPaths: workspace.missing,
  };
}

async function probePricingPage(origin, manifest) {
  const url = `${origin.replace(/\/$/, "")}/pricing`;
  const res = await fetch(url, {
    headers: { "cache-control": "no-cache", pragma: "no-cache", "user-agent": "BossMind-Immutable-Chain/1.0" },
  });
  const html = await res.text();
  const required = manifest?.requiredPricingHtmlMarkers || [];
  const forbidden = manifest?.forbiddenPricingHtmlPatterns || [];
  const requiredMissing = required.filter((m) => !html.includes(m));
  const forbiddenHits = forbidden.filter((m) => html.includes(m));
  const pricingTitleEn = (html.match(/Professional Career Upgrade Plans/gi) || []).length;
  const pricingTitleFr = (html.match(/Plans d'upgrade de carrière professionnelle/gi) || []).length;
  const headingCount = Math.max(pricingTitleEn, pricingTitleFr);
  const maxHeadings = manifest?.pricingHeadingMaxCount ?? 1;
  const duplicateHeading = headingCount > maxHeadings;
  const pricingHeaderBlocks = (html.match(/rs-pricing-header/g) || []).length;
  const tiers = [];
  const re = /data-tier="([^"]+)"/g;
  let m;
  while ((m = re.exec(html))) tiers.push(m[1]);
  const pricingTiers = tiers.filter((t) =>
    ["basic", "professional", "elite", "essential_advanced"].includes(t)
  );
  return {
    url,
    status: res.status,
    ok:
      res.ok &&
      requiredMissing.length === 0 &&
      forbiddenHits.length === 0 &&
      !duplicateHeading &&
      pricingHeaderBlocks === 0 &&
      pricingTiers.length >= 4 &&
      pricingTiers[pricingTiers.length - 1] === "essential_advanced",
    requiredMissing,
    forbiddenHits,
    duplicateHeading,
    headingCount,
    pricingHeaderBlocks,
    tierSequence: pricingTiers,
    hasLogo: html.includes("/brand/resumora-logo-original") || html.includes("data-rs-brand-logo"),
  };
}

async function runImmutableExecutionChain({
  cwd = process.cwd(),
  neonApi = null,
  projectKey = "resumora",
  origin = process.env.BOSSMIND_REALITY_LIVE_URL || "https://resumora.net",
  captureScreenshot = false,
} = {}) {
  const execCfg = loadExecutionConfig(cwd);
  const lock = loadImmutableConfig(cwd);
  const manifest = loadManifest(cwd);
  const originFinal = origin || execCfg.productionOrigin || lock.productionPublicOrigin || "https://resumora.net";

  const snapshotLoad = compareWorkspaceToSnapshot(cwd, lock);
  const checksumVerify = verifyImmutableBaseline(cwd);
  const structural = structuralAuthorityReport(cwd);
  const routeOwn = assessRouteOwnership(cwd);
  const deployVerifyRaw = await runDeploymentVerification({
    cwd,
    origin: originFinal,
    paths: execCfg.livePaths || ["/", "/pricing"],
  });
  const deployVerify = {
    ...deployVerifyRaw,
    ok: deployVerifyRaw.percent >= 80 && !deployVerifyRaw.blockDeploy,
  };
  const pricingLive = await probePricingPage(originFinal, manifest);

  const blockers = [];
  if (!lock.enabled) blockers.push("baseline_lock_disabled");
  if (!snapshotLoad.ok) blockers.push("workspace_snapshot_mismatch");
  if (!checksumVerify.ok) blockers.push("checksum_verify_failed");
  if (!structural.ok) blockers.push("structural_authority_failed");
  if (routeOwn.blockDeploy) blockers.push("route_ownership_violation");
  if (deployVerify.blockDeploy || deployVerify.percent < 80) blockers.push("deployment_verification_failed");
  if (!pricingLive.ok) blockers.push("pricing_live_baseline_failed");

  let screenshot = { skipped: true };
  if (captureScreenshot) {
    screenshot = await captureLiveScreenshot(cwd, `${originFinal}/pricing`, execCfg.screenshotOutputDir);
  }

  const report = {
    generatedAt: new Date().toISOString(),
    origin: originFinal,
    gitHead: gitHead(cwd),
    protectedBranch: execCfg.protectedBranch || "resumora-production-locked",
    ok: blockers.length === 0,
    blockers,
    snapshotLoad,
    checksumVerify: {
      ok: checksumVerify.ok,
      luxuryHash: checksumVerify.luxury?.hash,
      sealedHash: lock.lockedLuxuryInterfaceFingerprint,
    },
    structural: { ok: structural.ok, singleHomeAuthority: structural.singleHomeAuthority },
    routeOwnership: { ok: !routeOwn.blockDeploy, violations: routeOwn.violations },
    deploymentVerification: deployVerify,
    pricingLive,
    screenshot,
    layoutHashes: {
      pricingPanel: fileHash(cwd, "components/marketing/sections/PricingPanel.jsx"),
      priceTierCard: fileHash(cwd, "components/marketing/sections/PriceTierCard.jsx"),
      siteChrome: fileHash(cwd, "components/marketing/SiteChrome.js"),
      globalCss: fileHash(cwd, "styles/resumora-global.css"),
    },
  };

  const outDir = path.join(cwd, ".bossmind", "immutable-lock");
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "latest-execution.json"), JSON.stringify(report, null, 2), "utf8");

  if (neonApi?.enabled) {
    try {
      await neonApi.upsertLastConfirmedCheckpoint({
        projectKey,
        checkpointKey: execCfg.neonCheckpointKey || "immutable_ui_execution_lock",
        baselineHash: checksumVerify.luxury?.hash || snapshotLoad.workspaceHash,
        payload: report,
        source: "bossmind-immutable-execution-chain",
      });
      await neonApi.upsertTaskState({
        projectKey,
        taskKey: execCfg.neonTaskKey || "immutable_execution_chain:latest",
        status: report.ok ? "completed" : "blocked",
        payload: { ok: report.ok, blockers, generatedAt: report.generatedAt },
      });
      await neonApi.saveEvent({
        projectKey,
        eventType: report.ok ? "bossmind.immutable_lock.passed" : "bossmind.immutable_lock.blocked",
        severity: report.ok ? "info" : "error",
        payload: report,
      });
      report.neonPersisted = true;
    } catch (e) {
      report.neonPersisted = false;
      report.neonError = e.message;
    }
  }

  return report;
}

function gitHead(cwd) {
  try {
    return execSync("git rev-parse HEAD", { cwd, encoding: "utf8" }).trim();
  } catch {
    return null;
  }
}

function fileHash(cwd, rel) {
  const crypto = require("crypto");
  const abs = path.join(cwd, rel);
  if (!fs.existsSync(abs)) return null;
  return crypto.createHash("sha256").update(fs.readFileSync(abs)).digest("hex").slice(0, 16);
}

async function captureLiveScreenshot(cwd, url, outDirRel) {
  const outDir = path.join(cwd, outDirRel || ".bossmind/immutable-lock/screenshots");
  fs.mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outPath = path.join(outDir, `pricing-${stamp}.png`);
  const edgeCandidates = [
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  ];
  const edge = edgeCandidates.find((p) => fs.existsSync(p));
  if (!edge) {
    return { skipped: true, reason: "edge_not_found", url };
  }
  try {
    execSync(
      `"${edge}" --headless --disable-gpu --window-size=1440,1200 --screenshot="${outPath}" "${url}"`,
      { stdio: "pipe", timeout: 60000 }
    );
    return { ok: fs.existsSync(outPath), path: path.relative(cwd, outPath).replace(/\\/g, "/"), url };
  } catch (e) {
    return { ok: false, error: e.message, url };
  }
}

module.exports = {
  runImmutableExecutionChain,
  compareWorkspaceToSnapshot,
  probePricingPage,
  captureLiveScreenshot,
  loadExecutionConfig,
};
