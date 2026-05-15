#!/usr/bin/env node
/**
 * Lock BossMind production backup architecture into Neon (audit).
 *
 *   npm run bossmind:backup:architecture-lock -- --i-understand-external-hub --notes="D:\\BossMind hub active"
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

function sha256Hex(s) {
  return crypto.createHash("sha256").update(String(s), "utf8").digest("hex");
}

async function main() {
  require(join(root, "lib/shared/load-project-env.js")).loadProjectEnv(root);

  if (!hasFlag("i-understand-external-hub")) {
    console.error(
      "bossmind-backup-architecture-lock: refusing without --i-understand-external-hub (Neon audit; hub paths are local ops)."
    );
    process.exit(1);
  }

  const neon = require(join(root, "lib/shared/neon-memory.js"));
  await neon.ensureSharedMemoryInitialized().catch(() => {});
  if (!neon.getSqlClient()) {
    console.log(JSON.stringify({ ok: false, skipped: true, reason: "NEON_DATABASE_URL not set" }, null, 2));
    process.exit(0);
  }

  const regPath = join(root, "config", "bossmind-backup-projects-registry.json");
  const scopePath = join(root, "config", "bossmind-preservation-scope.json");
  const regRaw = fs.readFileSync(regPath, "utf8");
  const scopeRaw = fs.existsSync(scopePath) ? fs.readFileSync(scopePath, "utf8") : "";
  const regHash = sha256Hex(regRaw);
  const scopeHash = scopeRaw ? sha256Hex(scopeRaw) : "";
  const notes = arg("notes", "").slice(0, 2000);
  const projectKey = process.env.BOSSMIND_PROJECT_KEY || "resumora";
  const confirmedAt = new Date().toISOString();
  const taskKey = "bossmind:production_backup_architecture";
  const checkpointKey = "bossmind_production_backup_system";

  const payload = {
    registrySha256: regHash,
    preservationScopeSha256: scopeHash,
    notes,
    confirmedAt,
    source: "bossmind-backup-architecture-lock",
  };

  await neon.upsertTaskState({
    projectKey,
    taskKey,
    status: "verified",
    assignedAgent: process.env.BOSSMIND_ASSIGNED_AGENT || "operator",
    payload,
  });

  await neon.saveEvent({
    projectKey,
    eventType: "bossmind.production_backup_architecture_locked",
    severity: "info",
    source: "bossmind-backup-architecture-lock",
    eventKey: `backup_arch:${confirmedAt}`,
    payload,
  });

  await neon.upsertLastConfirmedCheckpoint({
    projectKey,
    checkpointKey,
    commitHash: process.env.GITHUB_SHA || "",
    baselineHash: regHash,
    payload: { taskKey, preservationScopeSha256: scopeHash },
    source: "bossmind-backup-architecture-lock",
    locked: true,
  });

  console.log(JSON.stringify({ ok: true, taskKey, checkpointKey, payload }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
