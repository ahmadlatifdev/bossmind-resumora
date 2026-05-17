/**
 * Error memory + auto-fix intelligence — real scans, Neon persistence when configured.
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const FIX_PATTERNS = [
  {
    id: "utf_bom",
    match: (ctx) => ctx.bomFiles?.length > 0,
    fixPattern: "Remove UTF-8 BOM from affected source files; re-save as UTF-8 without BOM.",
    errorType: "encoding",
  },
  {
    id: "duplicate_page_bootstrap",
    match: (ctx) => ctx.duplicateRoutes?.length > 0,
    fixPattern: "Resolve duplicate route ownership — keep single pages/* bootstrap per path.",
    errorType: "routing",
  },
  {
    id: "immutable_drift",
    match: (ctx) => ctx.immutableVerifyOk === false,
    fixPattern: "npm run bossmind:baseline:snapshot-sync && npm run bossmind:baseline:seal",
    errorType: "baseline",
  },
  {
    id: "pricing_ui_drift",
    match: (ctx) => ctx.pricingMarkerOk === false,
    fixPattern: "Deploy latest pricing commit; unregister service worker; npm run resumora:pricing:ui-verify",
    errorType: "ui_deploy",
  },
];

function sha256(text) {
  return crypto.createHash("sha256").update(String(text), "utf8").digest("hex");
}

function scanUtfBom(cwd, relPaths) {
  const hits = [];
  for (const rel of relPaths) {
    const abs = path.join(cwd, rel);
    if (!fs.existsSync(abs)) continue;
    const buf = fs.readFileSync(abs);
    if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
      hits.push(rel);
    }
  }
  return hits;
}

function scanDuplicateRoutes(cwd) {
  const pagesDir = path.join(cwd, "pages");
  const appDir = path.join(cwd, "app");
  const issues = [];
  if (fs.existsSync(pagesDir) && fs.existsSync(appDir)) {
    const pageIndex = path.join(pagesDir, "index.js");
    const appPage = path.join(appDir, "page.tsx");
    const appPageJs = path.join(appDir, "page.js");
    if (fs.existsSync(pageIndex) && (fs.existsSync(appPage) || fs.existsSync(appPageJs))) {
      issues.push({ type: "home_parallel_router", pages: ["pages/index.js", "app/page.*"] });
    }
  }
  return issues;
}

async function runErrorMemoryEngine({ cwd = process.cwd(), neonApi, projectKey = "resumora" } = {}) {
  const probePaths = [
    "lib/marketing/site-copy.js",
    "components/marketing/sections/PricingPanel.jsx",
    "pages/_document.js",
    "next.config.ts",
  ];
  const bomFiles = scanUtfBom(cwd, probePaths);
  const duplicateRoutes = scanDuplicateRoutes(cwd);

  let immutableVerifyOk = true;
  try {
    const { verifyImmutableBaseline } = require("./bossmind-immutable-baseline.js");
    const v = verifyImmutableBaseline(cwd);
    immutableVerifyOk = Boolean(v.ok);
  } catch {
    immutableVerifyOk = false;
  }

  let pricingMarkerOk = true;
  try {
    const auth = JSON.parse(
      fs.readFileSync(path.join(cwd, "config/bossmind-protected-ui-authority.json"), "utf8")
    );
    const marker = (auth.requiredHomeHtmlMarkers || []).find((m) => m.includes("data-rs-pricing-ui"));
    if (marker) {
      const panel = fs.readFileSync(
        path.join(cwd, "components/marketing/sections/PricingPanel.jsx"),
        "utf8"
      );
      const needle = marker.replace(/\\"/g, '"').replace(/^"|"$/g, "");
      pricingMarkerOk = panel.includes(needle.split("=")[0]);
    }
  } catch {
    pricingMarkerOk = false;
  }

  const ctx = { bomFiles, duplicateRoutes, immutableVerifyOk, pricingMarkerOk };
  const matchedPatterns = FIX_PATTERNS.filter((p) => p.match(ctx));
  const checks = [
    { id: "no_utf_bom", pass: bomFiles.length === 0, detail: bomFiles },
    { id: "no_duplicate_home_router", pass: duplicateRoutes.length === 0, detail: duplicateRoutes },
    { id: "immutable_baseline_ok", pass: immutableVerifyOk },
    { id: "pricing_marker_in_source", pass: pricingMarkerOk },
    { id: "fix_patterns_available", pass: matchedPatterns.length === 0 || matchedPatterns.every((p) => p.fixPattern) },
  ];
  const earned = checks.filter((c) => c.pass).length;
  const percent = Math.round((earned / checks.length) * 1000) / 10;

  const persisted = [];
  if (neonApi?.enabled && neonApi.upsertErrorMemory) {
    for (const p of matchedPatterns) {
      const fp = sha256(`${projectKey}:${p.id}:${cwd}`);
      try {
        await neonApi.upsertErrorMemory({
          fingerprint: fp,
          projectKey,
          errorType: p.errorType,
          errorMessage: `Detected pattern ${p.id}`,
          fixPattern: p.fixPattern,
        });
        persisted.push(p.id);
      } catch {
        /* ignore */
      }
    }
  }

  let knownErrors = [];
  if (neonApi?.enabled && neonApi.listKnownErrors) {
    try {
      knownErrors = await neonApi.listKnownErrors({ projectKey, limit: 20 });
    } catch {
      knownErrors = [];
    }
  }

  return {
    percent,
    checks,
    bomFiles,
    duplicateRoutes,
    matchedPatterns: matchedPatterns.map((p) => ({ id: p.id, fixPattern: p.fixPattern })),
    knownErrorsCount: knownErrors.length,
    neonPatternsPersisted: persisted,
  };
}

module.exports = {
  FIX_PATTERNS,
  runErrorMemoryEngine,
  scanUtfBom,
  scanDuplicateRoutes,
};
