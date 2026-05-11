/**
 * Immutable production luxury baseline — single authority for locked checksums + snapshot restore.
 * No git history mutation; restore copies from committed `config/bossmind-baseline-snapshots/`.
 */

const fs = require("fs");
const path = require("path");
const { computeBaselineFingerprint, computePathsFingerprint } = require("./bossmind-baseline-fingerprint.js");

const DEFAULT_CONFIG_REL = ["config", "bossmind-immutable-production-baseline.json"];

/** Luxury UI + shell + i18n + tokens — minimum immutable slice */
const DEFAULT_IMMUTABLE_INTERFACE_PATHS = [
  "components/marketing/HomePage.jsx",
  "components/marketing/SiteChrome.js",
  "components/marketing/MinimalAppChrome.js",
  "components/marketing/sections/TrustMetricsPanel.jsx",
  "components/marketing/sections/UploadPanel.jsx",
  "components/marketing/sections/PricingPanel.jsx",
  "components/marketing/FooterUniversalDock.jsx",
  "components/marketing/FooterSocialStrip.jsx",
  "components/marketing/FooterEngagementDock.jsx",
  "components/marketing/LanguageSwitcher.js",
  "pages/index.js",
  "context/LanguageContext.js",
  "lib/marketing/site-copy.js",
  "styles/resumora-global.css",
  "config/bossmind-protected-ui-authority.json",
  "config/bossmind-protected-surface.json",
  "next.config.ts",
];

function loadImmutableConfig(cwd = process.cwd()) {
  const p = path.join(cwd, ...DEFAULT_CONFIG_REL);
  if (!fs.existsSync(p)) {
    return { enabled: false, _missingConfig: true };
  }
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return { enabled: false, _invalidConfig: true };
  }
}

function getImmutableInterfacePaths(lock) {
  if (lock?.immutableInterfacePaths?.length) return lock.immutableInterfacePaths;
  return DEFAULT_IMMUTABLE_INTERFACE_PATHS;
}

/**
 * @returns {{ enabled: boolean, luxuryOk: boolean, workspaceOk: boolean, luxury: object, workspace: object, lock: object }}
 */
function verifyImmutableBaseline(cwd = process.cwd()) {
  const lock = loadImmutableConfig(cwd);
  if (!lock.enabled) {
    return {
      enabled: false,
      luxuryOk: true,
      workspaceOk: true,
      luxury: null,
      workspace: null,
      lock,
    };
  }

  const ifacePaths = getImmutableInterfacePaths(lock);
  const luxury = computePathsFingerprint(cwd, ifacePaths);
  const workspace = computeBaselineFingerprint(cwd);

  const luxuryOk =
    !luxury.missing.length &&
    Boolean(lock.lockedLuxuryInterfaceFingerprint) &&
    luxury.hash === lock.lockedLuxuryInterfaceFingerprint;

  /** When true, entire `bossmind-baseline-fingerprint` workspace set must match (strict). Default: luxury slice only. */
  const requireFull = lock.lockFullWorkspaceFingerprint === true;
  const workspaceOk = requireFull
    ? !workspace.missing.length &&
      Boolean(lock.lockedFullWorkspaceFingerprint) &&
      workspace.hash === lock.lockedFullWorkspaceFingerprint
    : true;

  return {
    enabled: true,
    luxuryOk,
    workspaceOk,
    ok: luxuryOk && workspaceOk,
    luxury,
    workspace,
    lock,
    snapshotRelativeDir: lock.snapshotRelativeDir || "config/bossmind-baseline-snapshots/luxury-v1",
  };
}

module.exports = {
  loadImmutableConfig,
  verifyImmutableBaseline,
  getImmutableInterfacePaths,
  DEFAULT_IMMUTABLE_INTERFACE_PATHS,
};
