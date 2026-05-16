#!/usr/bin/env node
/**
 * Record operator-confirmed Resumora AI support mail (Gmail + n8n + Neon) architecture to shared memory.
 * Does NOT connect Gmail, n8n, or AI APIs — audit only after external go-live.
 *
 *   npm run resumora:support:ai:arch-lock -- --i-understand-external-ops-manual --notes="n8n v1 live"
 *
 * Env: NEON_DATABASE_URL, BOSSMIND_PROJECT_KEY (default resumora)
 */
import fs from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function arg(name, def = "") {
  const eq = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (eq) return eq.slice(`--${name}=`.length).trim();
  return def;
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

function sha256Hex(s) {
  return crypto.createHash("sha256").update(String(s), "utf8").digest("hex");
}

async function main() {
  require(join(root, "lib/shared/load-project-env.js")).loadProjectEnv(root);

  if (!hasFlag("i-understand-external-ops-manual")) {
    console.error(
      "resumora-ai-support-mail-confirm: refusing without --i-understand-external-ops-manual (Neon audit only; Gmail/n8n are external)."
    );
    process.exit(1);
  }

  const neon = require(join(root, "lib/shared/neon-memory.js"));
  await neon.ensureSharedMemoryInitialized().catch(() => {});

  if (!neon.getSqlClient()) {
    console.log(JSON.stringify({ ok: false, skipped: true, reason: "NEON_DATABASE_URL not set" }, null, 2));
    process.exit(0);
  }

  const cfgPath = join(root, "config", "resumora-ai-support-mail-architecture.json");
  const dnsPath = join(root, "config", "resumora-support-mail-dns-authority.json");
  const raw = fs.readFileSync(cfgPath, "utf8");
  const cfg = JSON.parse(raw);
  const archHash = sha256Hex(raw);
  let dnsAuthoritySha256 = "";
  try {
    if (fs.existsSync(dnsPath)) {
      dnsAuthoritySha256 = sha256Hex(fs.readFileSync(dnsPath, "utf8"));
    }
  } catch {
    dnsAuthoritySha256 = "";
  }
  const notes = arg("notes", "").slice(0, 2000);
  const projectKey = process.env.BOSSMIND_PROJECT_KEY || "resumora";
  const confirmedAt = new Date().toISOString();
  const taskKey = "support_mail:resumora_ai_architecture";
  const checkpointKey = "resumora_ai_support_mail_stack";

  const payload = {
    architectureVersion: cfg.version ?? 0,
    architectureSha256: archHash,
    dnsAuthoritySha256: dnsAuthoritySha256 || undefined,
    supportMailbox: cfg.supportMailbox,
    notes,
    confirmedAt,
    source: "resumora-ai-support-mail-confirm",
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
    eventType: "resumora_ai_support_mail_architecture_confirmed",
    severity: "info",
    source: "resumora-ai-support-mail-confirm",
    eventKey: `support_ai_arch:${confirmedAt}`,
    payload,
  });

  await neon.upsertLastConfirmedCheckpoint({
    projectKey,
    checkpointKey,
    commitHash: process.env.GITHUB_SHA || "",
    baselineHash: archHash,
    payload: {
      taskKey,
      architectureVersion: cfg.version,
      confirmedAt,
    },
    source: "resumora-ai-support-mail-confirm",
    locked: true,
  });

  console.log(JSON.stringify({ ok: true, taskKey, checkpointKey, payload }, null, 2));
  process.exit(0);
}

main().catch((e) => {
  console.error("resumora-ai-support-mail-confirm:", e);
  process.exit(1);
});
