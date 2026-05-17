#!/usr/bin/env node
/**
 * Lock Resumora brand naming authority → Neon bossmind_brand_authority + bossmind_memory.
 * npm run bossmind:brand:authority:lock
 */
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";

const require = createRequire(import.meta.url);
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

async function main() {
  require(path.join(root, "lib/shared/load-project-env.js")).loadProjectEnv(root);
  const hub = require(path.join(root, "lib/shared/bossmind-hub-memory.js"));
  const neon = require(path.join(root, "lib/shared/neon-memory.js"));
  const { loadBrandAuthority } = require(path.join(root, "lib/marketing/bossmind-brand-authority.js"));
  const { buildCatalogReport } = require(path.join(root, "lib/marketing/stripe-brand-sync.js"));

  const config = loadBrandAuthority(root);
  const catalog = await buildCatalogReport({ cwd: root });
  const configHash = crypto.createHash("sha256").update(JSON.stringify(config)).digest("hex");

  await hub.ensureBossmindHubMemoryInitialized();
  await neon.ensureSharedMemoryInitialized();

  const projectKey = process.env.BOSSMIND_PROJECT_KEY || "resumora";
  const payload = {
    lockedAt: new Date().toISOString(),
    officialBrand: config.officialBrand,
    configHash,
    forbiddenVariants: config.forbiddenVariants,
    planStripeNames: config.planStripeNames,
    catalogProducts: config.catalogProducts,
    stripeCatalog: catalog.ok
      ? {
          productCount: catalog.counts?.products,
          needsUpdate: catalog.counts?.needsUpdate,
          planBindings: catalog.planBindings?.map((b) => ({
            planId: b.planId,
            productId: b.productId,
            officialName: b.officialName,
            currentName: b.analysis?.currentName,
          })),
        }
      : { error: catalog.error || catalog.reason },
  };

  const row = await hub.upsertBrandAuthority({
    projectKey,
    authorityKey: "naming",
    officialBrand: config.officialBrand,
    payload,
    locked: true,
  });

  await hub.upsertBossmindMemory({
    projectKey,
    memoryKey: config.lock?.memoryKey || "brand_authority:naming",
    memoryType: "brand_authority",
    payload,
    writerAgent: "bossmind_orchestrator",
    locked: true,
  });

  if (neon.upsertErrorMemory) {
    await neon.upsertErrorMemory({
      projectKey,
      errorType: "brand_authority_locked",
      errorMessage: "resumora_official_naming",
      rootCause: "legacy_resumero_variants_blocked",
      fixPattern: `npm run bossmind:stripe:brand-sync -- --apply && npm run ${config.lock?.verifyCommand || "bossmind:brand:authority:scan -- --stripe"}`,
    });
  }

  const snapDir = path.join(root, "config", "bossmind-baseline-snapshots", config.lock?.snapshotKey || "bossmind-brand-authority-v1");
  fs.mkdirSync(snapDir, { recursive: true });
  fs.copyFileSync(
    path.join(root, "config/bossmind-brand-authority.json"),
    path.join(snapDir, "bossmind-brand-authority.json")
  );

  const out = {
    ok: true,
    officialBrand: config.officialBrand,
    configHash,
    neonRow: row,
    snapshotDir: snapDir.replace(/\\/g, "/"),
    stripeNeedsUpdate: catalog.counts?.needsUpdate ?? null,
  };
  console.log(JSON.stringify(out, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
