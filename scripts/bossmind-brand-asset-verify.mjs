#!/usr/bin/env node
/**
 * Global Brand Asset Authority — verify locked logo file, scan conflicts, optional live probe.
 */
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const { runBrandAssetVerification } = require("../lib/orchestration/bossmind-brand-asset-verify.js");
const hub = require("../lib/shared/bossmind-hub-memory.js");

async function persistToSharedMemory(report) {
  if (!process.env.NEON_DATABASE_URL) return { persisted: false };
  await hub.ensureBossmindHubMemoryInitialized();
  await hub.upsertBossmindMemory({
    projectKey: "resumora",
    memoryKey: "brand_asset_authority_resumora",
    memoryType: "brand_authority",
    payload: report,
    writerAgent: "deployment_verifier",
    locked: true,
  });
  await hub.upsertProjectLock({
    projectKey: "resumora",
    lockType: "brand_logo",
    lockKey: "resumora-logo-original",
    payload: { sha256: report.actualHash, publicUrl: report.lockedPath },
    lockedBy: "bossmind-brand-asset-verify",
  });
  return { persisted: true };
}

async function main() {
  const origin = process.env.BOSSMIND_IMMUTABLE_PROBE_ORIGIN || process.env.BOSSMIND_BRAND_PROBE_ORIGIN || null;
  const report = await runBrandAssetVerification({ origin, probeHtml: Boolean(origin) });
  const mem = await persistToSharedMemory(report);
  console.log(JSON.stringify({ ...report, sharedMemory: mem }, null, 2));
  process.exit(report.ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
