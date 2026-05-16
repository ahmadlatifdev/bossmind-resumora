#!/usr/bin/env node
/**
 * Mandatory active-route + stale-fragment audit for Resumora pricing/trust/PWA.
 *   npm run resumora:deployment:route-audit
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

const SCAN_STRINGS = [
  "Trust at a glance",
  "ATS+",
  "EN/FR",
  "Secure checkout",
  "GLOBAL HIRING",
  "Greenhouse · Lever",
  "Install Resumora for faster access",
];

const ACTIVE_ROUTES = {
  homepage: "pages/index.js → components/marketing/HomePage.jsx",
  pricingPage: "pages/pricing.js → components/marketing/sections/PricingPanel.jsx",
  pricingSection: "components/marketing/sections/PricingPanel.jsx",
  siteChrome: "components/marketing/SiteChrome.js (InstallPrompt)",
  pwaPopup: "components/marketing/InstallPrompt.jsx",
  trustStub: "components/marketing/sections/TrustMetricsPanel.jsx (no-op)",
  plansData: "lib/marketing/site-copy.js → pricingPlans",
};

function walk(dir, hits, rel = "") {
  let entries = [];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (e.name === "node_modules" || e.name === ".next" || e.name === ".git") continue;
    const r = rel ? `${rel}/${e.name}` : e.name;
    const abs = path.join(dir, e.name);
    if (e.isDirectory()) walk(abs, hits, r);
    else if (/\.(jsx?|tsx?|css|json)$/.test(e.name)) {
      let body = "";
      try {
        body = fs.readFileSync(abs, "utf8");
      } catch {
        continue;
      }
      for (const s of SCAN_STRINGS) {
        if (body.includes(s)) hits.push({ file: r.replace(/\\/g, "/"), string: s });
      }
    }
  }
}

function readHead() {
  try {
    return require("child_process").execSync("git rev-parse HEAD", { cwd: root, encoding: "utf8" }).trim();
  } catch {
    return null;
  }
}

const PRICING_UI_MARKER = 'data-rs-pricing-ui="20260517-ea-v3-img2"';
const PLAN_ORDER_RE =
  /id: "basic"[\s\S]*id: "professional"[\s\S]*id: "elite"[\s\S]*id: "essential_advanced"/;

async function probeLive(origin) {
  const out = {};
  for (const p of ["/", "/pricing"]) {
    const res = await fetch(`${origin}${p}`, {
      headers: {
        "cache-control": "no-cache",
        pragma: "no-cache",
        "user-agent": "Resumora-Route-Audit/1.0",
      },
    });
    const html = await res.text();
    out[p] = {
      status: res.status,
      trustAtAGlance: html.includes("Trust at a glance"),
      trustPanel: html.includes("rs-trust-panel--slim"),
      essentialAdvanced: html.includes("Essential Advanced"),
      pricingMarker: html.includes(PRICING_UI_MARKER),
      deployUiMeta: (html.match(/name="resumora-deploy-ui" content="([^"]+)"/) || [])[1] || null,
      tierCount: (html.match(/data-tier="/g) || []).length,
      deployMeta: (html.match(/name="resumora-deploy-ui" content="([^"]+)"/) || [])[1] || null,
    };
  }
  return out;
}

async function main() {
  const origin = (process.env.RESUMORA_GOOGLE_AUDIT_ORIGIN || "https://resumora.net").replace(/\/$/, "");
  const hits = [];
  walk(root, hits);

  const home = fs.readFileSync(path.join(root, "components/marketing/HomePage.jsx"), "utf8");
  const siteCopy = fs.readFileSync(path.join(root, "lib/marketing/site-copy.js"), "utf8");
  const trustPanel = fs.readFileSync(path.join(root, "components/marketing/sections/TrustMetricsPanel.jsx"), "utf8");

  const snapshotStale = fs.existsSync(
    path.join(root, "config/bossmind-baseline-snapshots/luxury-v1/components/marketing/HomePage.jsx")
  )
    ? fs
        .readFileSync(path.join(root, "config/bossmind-baseline-snapshots/luxury-v1/components/marketing/HomePage.jsx"), "utf8")
        .includes("TrustMetricsPanel")
    : false;

  const live = await probeLive(origin);
  const branding = JSON.parse(
    fs.readFileSync(path.join(root, "config/branding-asset-version.json"), "utf8")
  );
  const { computePathsFingerprint } = require(path.join(root, "lib/orchestration/bossmind-ultra-antileak-lib.js"));
  const fp = computePathsFingerprint(root, [
    "components/marketing/HomePage.jsx",
    "components/marketing/sections/PricingPanel.jsx",
    "lib/marketing/site-copy.js",
  ]);

  const report = {
    generatedAt: new Date().toISOString(),
    brandingAssetVersion: branding.version,
    activeDeployedCommitId: readHead(),
    activeProductionRoutes: ACTIVE_ROUTES,
    repoSourceValidation: {
      homeImportsTrustPanel: home.includes("TrustMetricsPanel"),
      trustPanelIsNoOp: trustPanel.includes("return null"),
      essentialAdvancedInSiteCopy: /id:\s*"essential_advanced"/.test(siteCopy),
      planOrderImage2: PLAN_ORDER_RE.test(siteCopy),
      luxuryV1SnapshotStillHasTrust: snapshotStale,
    },
    stringScanHits: hits.filter((h) => !h.file.startsWith("config/bossmind-baseline-snapshots")),
    snapshotArchiveHits: hits.filter((h) => h.file.startsWith("config/bossmind-baseline-snapshots")),
    liveProbe: live,
    runtimeChecksum: fp.hash,
    rootCauseHints: [
      snapshotStale ? "luxury-v1 baseline snapshot still contains TrustMetricsPanel — bossmind:baseline:restore would reintroduce stale UI" : null,
      "Client PWA may cache old HTML until service worker updates to network-first + new CACHE name",
      "User browser hard refresh / uninstall PWA required if live probe passes but screenshots show old UI",
    ].filter(Boolean),
  };

  const outDir = path.join(root, "windows-heal", "reports");
  fs.mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outFile = path.join(outDir, `resumora-deployment-route-audit-${stamp}.json`);
  fs.writeFileSync(outFile, JSON.stringify(report, null, 2), "utf8");
  report.reportFile = outFile.replace(/\\/g, "/");

  console.log(JSON.stringify(report, null, 2));
  const liveOk = live["/"]?.essentialAdvanced && !live["/"]?.trustAtAGlance && live["/"]?.tierCount >= 4;
  process.exit(liveOk ? 0 : 2);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
