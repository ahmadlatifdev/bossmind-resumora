#!/usr/bin/env node
/**
 * Local end-to-end runtime validation (DB + auth + entitlements + catalog).
 * Does not hit Stripe live. Requires NEON in .env.local (npm run bossmind:sync:hub-database-env).
 */
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

require(path.join(root, "lib/shared/ensure-project-env.js"));

const neon = require(path.join(root, "lib/shared/neon-memory.js"));
const store = require(path.join(root, "lib/engagement/store.js"));
const ent = require(path.join(root, "lib/client/entitlements-store.js"));
const { getInterviewPrepCatalog } = require(path.join(root, "lib/essential-advanced/interview-prep-content.js"));

async function main() {
  const results = [];
  const push = (name, ok, detail = "") => results.push({ name, ok, detail });

  const db = await neon.probeDatabaseConnection();
  push("database_probe", db.ok, db.reason || db.source || "");

  await neon.ensureEngagementSchema();
  push("engagement_schema", true);

  const email = `e2e-${Date.now()}@resumora-e2e.invalid`;
  const reg = await store.registerProfile({
    email,
    password: "E2eLocal123!",
    displayName: "E2E Local",
  });
  push("register_profile", reg.ok, reg.error || "");

  if (reg.ok) {
    const login = await store.loginProfile(email, "E2eLocal123!");
    push("login_profile", login.ok, login.error || "");

    const grant = await ent.grantEntitlement({
      planId: "essential_advanced",
      profileId: reg.profile.id,
      customerEmail: email,
    });
    push("grant_entitlement_ea", grant.ok, grant.error || "");

    const access = await ent.hasEntitlement(reg.profile.id, email, "essential_advanced");
    push("has_entitlement_ea", access.entitled, access.source || "");

    for (const plan of ["basic", "professional", "elite"]) {
      const g = await ent.grantEntitlement({ planId: plan, profileId: reg.profile.id });
      push(`grant_${plan}`, g.ok);
    }

    const list = await ent.listEntitlementsForUser(reg.profile.id, email);
    push("list_entitlements", list.length >= 4, `count=${list.length}`);

    const cat = getInterviewPrepCatalog("fr");
    push("catalog_fr", cat.counts.qa >= 50, `qa=${cat.counts.qa}`);
  }

  const ok = results.every((r) => r.ok);
  console.log(JSON.stringify({ ok, results }, null, 2));
  process.exit(ok ? 0 : 2);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
