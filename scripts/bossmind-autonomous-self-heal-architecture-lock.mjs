#!/usr/bin/env node
/**
 * Neon audit lock for autonomous self-heal POLICY (not enabling auto-push/write).
 *
 *   npm run bossmind:autonomous:self-heal:arch-lock -- --i-understand-policy-bounds --notes="Q2-2026 reviewed"
 */
import fs from "node:fs";
import crypto from "node:crypto";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

function arg(name, def = "") {
  const eq = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (eq) return eq.slice(`--${name}=`.length).trim();
  return def;
}

async function main() {
  require(join(root, "lib/shared/load-project-env.js")).loadProjectEnv(root);

  if (!hasFlag("i-understand-policy-bounds")) {
    console.error(
      "Refusing: add --i-understand-policy-bounds (locks policy hash to Neon; does NOT enable auto-write/git push)."
    );
    process.exit(1);
  }

  const neon = require(join(root, "lib/shared/neon-memory.js"));
  await neon.ensureSharedMemoryInitialized().catch(() => {});
  if (!neon.getSqlClient()) {
    console.log(JSON.stringify({ ok: false, skipped: true, reason: "NEON_DATABASE_URL not set" }, null, 2));
    process.exit(0);
  }

  const policyPath = join(root, "config", "bossmind-autonomous-self-heal-policy.json");
  const raw = fs.readFileSync(policyPath, "utf8");
  const hash = crypto.createHash("sha256").update(raw).digest("hex");
  const notes = arg("notes", "").slice(0, 2000);
  const projectKey = process.env.BOSSMIND_PROJECT_KEY || "resumora";
  const confirmedAt = new Date().toISOString();
  const taskKey = "bossmind:autonomous_self_heal_policy";
  const checkpointKey = "bossmind_autonomous_self_heal_policy";

  const payload = { policySha256: hash, notes, confirmedAt, source: "bossmind-autonomous-self-heal-arch-lock" };

  await neon.upsertTaskState({
    projectKey,
    taskKey,
    status: "verified",
    assignedAgent: process.env.BOSSMIND_ASSIGNED_AGENT || "operator",
    payload,
  });

  await neon.saveEvent({
    projectKey,
    eventType: "bossmind.autonomous_self_heal_policy_locked",
    severity: "info",
    source: "bossmind-autonomous-self-heal-arch-lock",
    eventKey: `self_heal_policy:${confirmedAt}`,
    payload,
  });

  await neon.upsertLastConfirmedCheckpoint({
    projectKey,
    checkpointKey,
    commitHash: process.env.GITHUB_SHA || "",
    baselineHash: hash,
    payload: { taskKey, notes },
    source: "bossmind-autonomous-self-heal-arch-lock",
    locked: true,
  });

  console.log(JSON.stringify({ ok: true, taskKey, checkpointKey, policySha256: hash }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
