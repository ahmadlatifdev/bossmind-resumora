#!/usr/bin/env node
/**
 * Seal resumora-hero-approved-v2 — transparent logo + centered hero into BossMind shared memory.
 *   npm run bossmind:hero-approved:lock
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

const SNAPSHOT_KEY = "resumora-hero-approved-v2";
const SNAP_REL = `config/bossmind-baseline-snapshots/${SNAPSHOT_KEY}`;

const APPROVED_PATHS = [
  "components/brand/ResumoraLogo.tsx",
  "lib/marketing/brand-asset-authority.constants.js",
  "config/bossmind-brand-asset-authority.json",
  "public/brand/resumora-logo-official-transparent.png",
  "components/marketing/HomePage.jsx",
  "components/marketing/SiteChrome.js",
  "lib/marketing/site-copy.js",
  "styles/resumora-global.css",
  "config/bossmind-protected-ui-authority.json",
];

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
  if (!process.env.NEON_DATABASE_URL) return { enabled: false, persisted: false };
  await hub.ensureBossmindHubMemoryInitialized();
  const writerAgent = "bossmind_orchestrator";
  const projectKey = "resumora";

  await hub.upsertBossmindMemory({
    projectKey,
    memoryKey: "hero_approved_v2",
    memoryType: "design_authority",
    payload: payload,
    writerAgent,
    locked: true,
  });
  await hub.upsertBossmindMemory({
    projectKey,
    memoryKey: "brand_asset_authority_resumora",
    memoryType: "brand_authority",
    payload: payload.brandAuthority,
    writerAgent,
    locked: true,
  });
  await hub.saveDesignSnapshot({
    projectKey,
    snapshotKey: SNAPSHOT_KEY,
    baselineHash: payload.designFingerprint.hash,
    routePath: "/",
    payload: payload.heroApproved,
    locked: true,
  });
  await hub.upsertProjectLock({
    projectKey,
    lockType: "hero_approved_design",
    lockKey: SNAPSHOT_KEY,
    payload,
    lockedBy: writerAgent,
  });
  return { enabled: true, persisted: true };
}

async function main() {
  const brandCfg = JSON.parse(fs.readFileSync(path.join(root, "config/bossmind-brand-asset-authority.json"), "utf8"));
  const uiAuth = JSON.parse(fs.readFileSync(path.join(root, "config/bossmind-protected-ui-authority.json"), "utf8"));
  const designFingerprint = computePathsFingerprint(root, APPROVED_PATHS);
  const logoHash = readLockedLogoHash(root);
  const { snapRoot, filesCopied } = syncSnapshot();

  const payload = {
    snapshotKey: SNAPSHOT_KEY,
    sealedAt: new Date().toISOString(),
    heroApproved: {
      logo: { transparent: true, publicUrl: brandCfg.lockedLogo.publicUrl, sha256: logoHash },
      structure: "centered_premium_hero",
      headline: "Elite Career Positioning For Executives, Professionals, And High-Value Talent.",
      spacingSystem: "rs-hero-lux-wrap--centered",
      typography: "rs-h1 rs-week-headline + rs-lead--lux",
      palette: ["#05070A", "#C9A227", "#FFFFFF"],
      visualRhythm: "reduced_duplicate_trust_strip",
    },
    designFingerprint,
    brandAuthority: brandCfg,
    filesCopied,
    snapshotDir: SNAP_REL,
  };

  const outConfig = path.join(root, "config", "bossmind-hero-approved-v2-lock.json");
  fs.writeFileSync(outConfig, JSON.stringify(payload, null, 2), "utf8");
  fs.mkdirSync(path.join(root, ".bossmind", "hero-approved-v2"), { recursive: true });
  fs.writeFileSync(path.join(root, ".bossmind", "hero-approved-v2", "latest-lock.json"), JSON.stringify(payload, null, 2), "utf8");

  const neon = await persistNeon(payload);
  console.log(JSON.stringify({ ok: Boolean(logoHash), snapshotKey: SNAPSHOT_KEY, logoHash, designHash: designFingerprint.hash, sharedMemory: neon }, null, 2));
  process.exit(logoHash ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
