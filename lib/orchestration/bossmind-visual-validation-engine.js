/**
 * Visual Verification Engine — live HTML + screenshot + layout hash drift (Applitools optional).
 */
const fs = require("fs");
const path = require("path");
const hub = require("../shared/bossmind-hub-memory");
const { runBrandAssetVerification } = require("./bossmind-brand-asset-verify");
const { runImmutableExecutionChain } = require("./bossmind-immutable-execution-chain");

function loadBaselineLayoutHash(cwd, projectKey) {
  const snap = path.join(cwd, ".bossmind", "immutable-lock", "latest-execution.json");
  if (!fs.existsSync(snap)) return null;
  try {
    const j = JSON.parse(fs.readFileSync(snap, "utf8"));
    return j.layoutHashes?.siteChrome || null;
  } catch {
    return null;
  }
}

async function runVisualValidation({
  cwd = process.cwd(),
  projectKey = "resumora",
  origin = null,
  captureScreenshot = true,
  neonApi = null,
} = {}) {
  const originFinal = origin || process.env.BOSSMIND_IMMUTABLE_PROBE_ORIGIN || "https://resumora.net";
  const chain = await runImmutableExecutionChain({
    cwd,
    neonApi,
    projectKey,
    origin: originFinal,
    captureScreenshot,
  });

  const brand = await runBrandAssetVerification({ origin: originFinal, probeHtml: true });
  const pricing = chain.pricingLive || {};
  const duplicateSections = Boolean(pricing.duplicateHeading);
  const driftFromBaseline =
    chain.layoutHashes?.siteChrome &&
    loadBaselineLayoutHash(cwd, projectKey) &&
    chain.layoutHashes.siteChrome !== loadBaselineLayoutHash(cwd, projectKey);

  const ok =
    chain.ok &&
    brand.ok &&
    !duplicateSections &&
    !driftFromBaseline &&
    Boolean(pricing.hasLogo);

  const report = {
    ok,
    origin: originFinal,
    routePath: "/pricing",
    duplicateSections,
    driftDetected: Boolean(driftFromBaseline),
    logoOk: Boolean(pricing.hasLogo && brand.liveAsset?.hashMatch),
    layoutHash: chain.layoutHashes?.siteChrome || null,
    screenshotPath: chain.screenshot?.path || null,
    brand,
    immutableChain: { ok: chain.ok, blockers: chain.blockers },
    applitools: {
      configured: Boolean(process.env.APPLITOOLS_API_KEY),
      note: process.env.APPLITOOLS_API_KEY
        ? "API key present — wire Applitools Eyes batch in CI for pixel diff"
        : "optional APPLITOOLS_API_KEY not set",
    },
  };

  if (neonApi?.enabled || process.env.NEON_DATABASE_URL) {
    await hub.ensureBossmindHubMemoryInitialized();
    await hub.saveVisualValidation({
      projectKey,
      origin: originFinal,
      routePath: "/pricing",
      ok,
      driftDetected: report.driftDetected,
      duplicateSections,
      logoOk: report.logoOk,
      layoutHash: report.layoutHash,
      screenshotPath: report.screenshotPath,
      payload: report,
    });
  }

  return report;
}

module.exports = { runVisualValidation };
