#!/usr/bin/env node
/**
 * Seal resumora-production-approved-v1 — logo, luxury UI, routes into BossMind shared memory.
 *   npm run bossmind:production-approved:lock
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const hub = require(path.join(root, "lib/shared/bossmind-hub-memory.js"));
const { readLockedLogoHash } = require(path.join(root, "lib/marketing/brand-asset-authority.js"));
const { computePathsFingerprint } = require(path.join(root, "lib/orchestration/bossmind-baseline-fingerprint.js"));
const { loadImmutableConfig, getImmutableInterfacePaths } = require(path.join(root, "lib/orchestration/bossmind-immutable-baseline.js"));

const SNAPSHOT_KEY = "resumora-production-approved-v1";
const SNAP_REL = `config/bossmind-baseline-snapshots/${SNAPSHOT_KEY}`;

const APPROVED_PATHS = [
  "components/brand/ResumoraLogo.tsx",
  "lib/marketing/brand-asset-authority.constants.js",
  "lib/marketing/brand-asset-authority.js",
  "config/bossmind-brand-asset-authority.json",
  "public/brand/resumora-logo-official.jpg",
  "config/bossmind-protected-ui-authority.json",
  "config/bossmind-safety-rules.json",
  "config/bossmind-marketing-rules.json",
  "styles/resumora-global.css",
  "components/marketing/SiteChrome.js",
  "components/marketing/MinimalAppChrome.js",
  "components/marketing/sections/PricingPanel.jsx",
  "components/marketing/sections/PriceTierCard.jsx",
  "pages/pricing.js",
  "pages/login.js",
  "pages/register.js",
  "pages/dashboard.js",
];

function hashFile(rel) {
  const p = path.join(root, rel);
  if (!fs.existsSync(p)) return null;
  return crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");
}

function syncSnapshot() {
  const snapRoot = path.join(root, SNAP_REL);
  let n = 0;
  for (const rel of APPROVED_PATHS) {
    const src = path.join(root, rel);
    if (!fs.existsSync(src)) continue;
    const dest = path.join(snapRoot, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
    n += 1;
  }
  return { snapRoot, filesCopied: n };
}

async function persistNeon(payload) {
  if (!process.env.NEON_DATABASE_URL) {
    return { enabled: false, persisted: false };
  }
  await hub.ensureBossmindHubMemoryInitialized();
  const writerAgent = "bossmind_orchestrator";
  const projectKey = "resumora";

  await hub.upsertBossmindMemory({
    projectKey,
    memoryKey: "brand_asset_authority_resumora",
    memoryType: "brand_authority",
    payload: payload.brandAuthority,
    writerAgent,
    locked: true,
  });
  await hub.upsertBossmindMemory({
    projectKey,
    memoryKey: "runtime_authority_latest",
    memoryType: "runtime_authority",
    payload: payload.runtimeAuthority,
    writerAgent,
    locked: true,
  });
  await hub.saveDesignSnapshot({
    projectKey,
    snapshotKey: SNAPSHOT_KEY,
    baselineHash: payload.designFingerprint.hash,
    routePath: "/",
    payload: payload.designApproved,
    locked: true,
  });
  await hub.upsertProjectLock({
    projectKey,
    lockType: "production_approved_design",
    lockKey: SNAPSHOT_KEY,
    payload: payload,
    lockedBy: writerAgent,
  });

  const safety = JSON.parse(fs.readFileSync(path.join(root, "config/bossmind-safety-rules.json"), "utf8"));
  for (const rule of safety.rules || []) {
    await hub.upsertSafetyRule({
      ruleId: rule.id,
      ruleText: rule.text,
      severity: rule.severity,
      payload: rule,
    });
  }

  return { enabled: true, persisted: true };
}

async function main() {
  const brandCfg = JSON.parse(fs.readFileSync(path.join(root, "config/bossmind-brand-asset-authority.json"), "utf8"));
  const uiAuth = JSON.parse(fs.readFileSync(path.join(root, "config/bossmind-protected-ui-authority.json"), "utf8"));
  const lock = loadImmutableConfig(root);
  const ifacePaths = [...new Set([...getImmutableInterfacePaths(lock), ...APPROVED_PATHS])];
  const designFingerprint = computePathsFingerprint(root, ifacePaths);
  const logoHash = readLockedLogoHash(root);
  const { snapRoot, filesCopied } = syncSnapshot();

  const payload = {
    snapshotKey: SNAPSHOT_KEY,
    sealedAt: new Date().toISOString(),
    gitHead: (() => {
      try {
        const { execSync } = require("node:child_process");
        return execSync("git rev-parse HEAD", { cwd: root, encoding: "utf8" }).trim();
      } catch {
        return null;
      }
    })(),
    logo: {
      publicUrl: brandCfg.lockedLogo.publicUrl,
      sha256: logoHash,
      fileHash: hashFile("public/brand/resumora-logo-official.jpg"),
    },
    designApproved: {
      theme: "luxury_dark",
      typography: "serif_headings_sans_body",
      spacingSystem: "rs-luxury-grid",
      pricingLayout: "four_tier_centered",
      ctaStructure: "rs-btn-accent_select_plan",
      sidebarStructure: "rs-sidebar-nav",
      colorPalette: ["#05070A", "#D4AF37", "#FFFFFF"],
      responsive: "mobile_first",
      cardAlignment: "centered_pricing_grid",
      productionRoutes: uiAuth.canonicalRoutes || { homePath: "/", pricing: "/pricing" },
      requiredHomeMarkers: uiAuth.requiredHomeHtmlMarkers,
      requiredPricingMarkers: uiAuth.requiredPricingHtmlMarkers,
    },
    designFingerprint,
    brandAuthority: brandCfg,
    runtimeAuthority: {
      snapshotKey: SNAPSHOT_KEY,
      protectionRules: (JSON.parse(fs.readFileSync(path.join(root, "config/bossmind-safety-rules.json"), "utf8")).rules || []).map(
        (r) => r.id
      ),
      logoLocked: true,
      autoRollbackOnDrift: true,
    },
    snapshotDir: SNAP_REL,
    filesCopied,
  };

  const outConfig = path.join(root, "config", "bossmind-production-approved-v1-lock.json");
  fs.writeFileSync(outConfig, JSON.stringify(payload, null, 2), "utf8");
  fs.mkdirSync(path.join(root, ".bossmind", "production-approved-v1"), { recursive: true });
  fs.writeFileSync(
    path.join(root, ".bossmind", "production-approved-v1", "latest-lock.json"),
    JSON.stringify(payload, null, 2),
    "utf8"
  );

  const neon = await persistNeon(payload);
  console.log(
    JSON.stringify(
      {
        ok: Boolean(logoHash && designFingerprint.hash),
        snapshotKey: SNAPSHOT_KEY,
        snapshotDir: snapRoot,
        filesCopied,
        logoHash,
        designHash: designFingerprint.hash,
        configWritten: outConfig,
        sharedMemory: neon,
      },
      null,
      2
    )
  );
  process.exit(logoHash && designFingerprint.hash ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
