/**
 * Workspace baseline fingerprint — shared by runtime-sync, immutable lock, deploy gate.
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { loadManifest } = require("./bossmind-interface-authority.js");

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function loadAuthorityMarkers(cwd) {
  const m = loadManifest(cwd) || {};
  return {
    requiredHomeHtmlMarkers:
      m.requiredHomeHtmlMarkers || [
        'id="top"',
        'id="home-intake"',
        'id="pricing"',
        'data-tier="essential_advanced"',
        "rs-week-main",
        "rs-pricing-grid",
      ],
    forbiddenLiveHtmlPatterns: m.forbiddenLiveHtmlPatterns || [],
    fingerprintExtraPaths: m.fingerprintExtraPaths || [],
  };
}

function loadProtectedPaths(cwd) {
  const cfgPath = path.join(cwd, "config", "bossmind-protected-surface.json");
  let fromCfg = [];
  try {
    const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
    fromCfg = [...(cfg.surfaceLockPaths || []), ...(cfg.shellLockPaths || [])];
  } catch {
    fromCfg = [];
  }
  const { fingerprintExtraPaths } = loadAuthorityMarkers(cwd);
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

function computeBaselineFingerprint(cwd = process.cwd()) {
  const files = loadProtectedPaths(cwd);
  const parts = [];
  const missing = [];
  for (const rel of files) {
    const abs = path.join(cwd, ...rel.split("/"));
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

/**
 * Fingerprint an explicit relative path list (luxury slice, route configs, etc.).
 */
function computePathsFingerprint(cwd, relPaths) {
  const files = [...new Set(relPaths.map((p) => String(p).replace(/\\/g, "/")))].sort();
  const parts = [];
  const missing = [];
  for (const rel of files) {
    const abs = path.join(cwd, ...rel.split("/").filter(Boolean));
    if (!fs.existsSync(abs)) {
      missing.push(rel);
      parts.push(`${rel}:<missing>`);
      continue;
    }
    const body = fs.readFileSync(abs, "utf8");
    parts.push(`${rel}:${sha256(body)}`);
  }
  return { files, missing, hash: sha256(parts.join("\n")) };
}

module.exports = {
  sha256,
  loadProtectedPaths,
  loadAuthorityMarkers,
  computeBaselineFingerprint,
  computePathsFingerprint,
};
