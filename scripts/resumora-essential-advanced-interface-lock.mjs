#!/usr/bin/env node
/**
 * Lock Essential Advanced client interface config to Neon automation_memory.
 *
 *   npm run resumora:essential-advanced:interface-lock -- --i-understand-production --notes="deployed"
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

function arg(name, def = "") {
  const eq = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (eq) return eq.slice(`--${name}=`.length).trim();
  return def;
}

async function main() {
  if (!hasFlag("i-understand-production")) {
    console.error("Refusing: add --i-understand-production (locks Neon automation_memory only).");
    process.exit(1);
  }

  require(path.join(root, "lib/shared/load-project-env.js")).loadProjectEnv(root);

  const configPath = path.join(root, "config/resumora-essential-advanced-plan.json");
  const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  const { resolveStripePriceId } = require(path.join(root, "lib/marketing/stripe-plan-map.js"));

  const siteCopyRaw = fs.readFileSync(path.join(root, "lib/marketing/site-copy.js"), "utf8");
  const planOrderMatch = siteCopyRaw.match(
    /id: "basic"[\s\S]*?id: "professional"[\s\S]*?id: "elite"[\s\S]*?id: "essential_advanced"/
  );

  const payload = {
    lockedAt: new Date().toISOString(),
    memoryType: "LOCKED_PRODUCTION_CLIENT_INTERFACE_CONFIGURATION",
    planId: "essential_advanced",
    displayName: config.displayName,
    priceUsd: config.priceUsd,
    stripePriceId: resolveStripePriceId("essential_advanced") || null,
    stripeEnv: config.stripeEnv,
    deliverables: config.deliverables,
    pricingCardOrder: config.pricingCardOrder || ["basic", "professional", "elite", "essential_advanced"],
    pricingCardOrderVerified: Boolean(planOrderMatch),
    trustAtAGlanceRemoved: config.uiRemovals?.trustAtAGlanceSection === true,
    pricingUiMarker: "20260517-ea-v3-img2",
    pwaCachePolicy: "network-first-html-20260517-rs2",
    uiPlanSnapshot: { id: "essential_advanced", priceUsd: config.priceUsd, env: config.stripeEnv },
    notes: arg("notes", "").slice(0, 2000),
  };

  const neon = require(path.join(root, "lib/shared/neon-memory.js"));
  await neon.ensureSharedMemoryInitialized().catch(() => {});
  const sql = neon.getSqlClient();
  if (!sql) {
    console.log(JSON.stringify({ ok: false, skipped: true, reason: "NEON_DATABASE_URL unset", payload }, null, 2));
    process.exit(0);
  }

  const projectKey = process.env.BOSSMIND_PROJECT_KEY || "resumora";
  const memoryKey = "resumora:locked_production_client_interface";

  await sql`
    INSERT INTO automation_memory (project_key, memory_key, payload, updated_at)
    VALUES (${projectKey}, ${memoryKey}, ${JSON.stringify(payload)}::jsonb, NOW())
    ON CONFLICT (project_key, memory_key) DO UPDATE SET
      payload = EXCLUDED.payload,
      updated_at = NOW()
  `;

  await neon.saveEvent({
    projectKey,
    eventType: "resumora.essential_advanced.interface_locked",
    severity: "info",
    source: "resumora-essential-advanced-interface-lock",
    eventKey: `ea:${payload.lockedAt}`,
    payload: {
      planId: payload.planId,
      priceUsd: payload.priceUsd,
      stripePriceId: payload.stripePriceId,
    },
  });

  console.log(JSON.stringify({ ok: true, projectKey, memoryKey, payload }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
