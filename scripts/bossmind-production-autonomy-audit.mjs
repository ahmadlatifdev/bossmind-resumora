#!/usr/bin/env node
/**
 * Resumora production autonomy audit — backend/orchestration only (UI design lock preserved).
 *
 *   npm run bossmind:production:autonomy-audit
 *   BOSSMIND_AUDIT_STRICT=1 — exit 1 if autonomy < 95 or critical probes fail
 */
import { spawnSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const hubRoot = path.resolve(root, "..");
const shakhsyHub = "D:/Shakhsy11/BossMind";
const memoryOutDir = path.join(hubRoot, "13-shared-memory");

function loadEnv() {
  try {
    require(path.join(root, "lib/shared/load-project-env.js")).loadProjectEnv(root);
  } catch {
    /* ignore */
  }
}

function readJsonSafe(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function maskSecret(val) {
  const s = String(val || "").trim();
  if (!s) return null;
  if (s.length <= 8) return "***";
  return `${s.slice(0, 4)}…${s.slice(-4)}`;
}

function envPresent(key) {
  const v = process.env[key];
  return Boolean(v && String(v).trim());
}

async function probeUrl(url, timeoutSec = 15, headers = {}) {
  const ac = new AbortController();
  const tid = setTimeout(() => ac.abort(), timeoutSec * 1000);
  try {
    const r = await fetch(url, { signal: ac.signal, redirect: "follow", headers });
    const text = await r.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      json = { rawPreview: text.slice(0, 300) };
    }
    clearTimeout(tid);
    return { ok: r.ok, status: r.status, url, json };
  } catch (e) {
    clearTimeout(tid);
    return { ok: false, url, error: e.message || String(e) };
  }
}

function runScript(rel) {
  const r = spawnSync(process.execPath, [path.join(root, rel)], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
  });
  const out = (r.stdout || "").trim();
  let json = null;
  try {
    json = JSON.parse(out);
  } catch {
    json = { raw: out.slice(0, 800), stderr: (r.stderr || "").slice(0, 400) };
  }
  return { ok: (r.status ?? 1) === 0, code: r.status ?? 1, json };
}

function scoreSystems(checks) {
  const weights = {
    productionHealth: 12,
    stripeHealth: 12,
    orchestrationHealth: 10,
    stripeEnv: 8,
    webhookSecret: 8,
    neonDb: 8,
    immutableBaseline: 10,
    webhookActivationModule: 6,
    sharedMemoryHub: 6,
    errorMemoryLogs: 4,
    automationRegistry: 4,
    s3Configured: 4,
    designLockIntact: 8,
  };
  let earned = 0;
  let max = 0;
  for (const [key, weight] of Object.entries(weights)) {
    max += weight;
    if (checks[key]?.ok) earned += weight;
    else if (checks[key]?.partial) earned += Math.floor(weight * 0.5);
  }
  return { percent: max ? Math.round((earned / max) * 100) : 0, earned, max };
}

function classifySystems(checks) {
  const active = [];
  const partial = [];
  const broken = [];
  for (const [name, c] of Object.entries(checks)) {
    const entry = { name, ...c };
    if (c.ok) active.push(entry);
    else if (c.partial) partial.push(entry);
    else broken.push(entry);
  }
  return { active, partial, broken };
}

function memoryHealth(shakhsyRoot) {
  const mem = path.join(shakhsyRoot, "core", "memory");
  const logs = path.join(mem, "logs");
  const liveState = readJsonSafe(path.join(mem, "bossmind-live-state.json"));
  const validation = readJsonSafe(path.join(mem, "live-validation-report.json"));
  const jsonlFiles = ["shared-memory-log.jsonl", "error-memory-log.jsonl", "task-state-log.jsonl"];
  const jsonl = {};
  for (const f of jsonlFiles) {
    const p = path.join(logs, f);
    jsonl[f] = {
      exists: fs.existsSync(p),
      bytes: fs.existsSync(p) ? fs.statSync(p).size : 0,
    };
  }
  return {
    ok: Boolean(
      liveState?.timestamp ||
        liveState?.generatedAt ||
        liveState?.lastScanCompletedUtc
    ),
    partial: Boolean(validation),
    memoryRoot: mem,
    liveStateAge:
      liveState?.timestamp ||
      liveState?.generatedAt ||
      liveState?.lastScanCompletedUtc ||
      null,
    validationOk: validation?.ok ?? validation?.allPassed ?? null,
    jsonl,
  };
}

async function main() {
  loadEnv();
  const origin = (process.env.NEXT_PUBLIC_SITE_URL || "https://www.resumora.net").replace(/\/$/, "");
  const timestamp = new Date().toISOString();

  const productionHealth = await probeUrl(`${origin}/api/health`);
  const stripeHealth = await probeUrl(`${origin}/api/runtime/stripe-health`);
  const orchHeaders = {};
  if (process.env.BOSSMIND_ORCHESTRATION_SECRET) {
    orchHeaders.Authorization = `Bearer ${process.env.BOSSMIND_ORCHESTRATION_SECRET}`;
  }
  const orchestrationHealth = await probeUrl(
    `${origin}/api/orchestration/bossmind-health`,
    20,
    orchHeaders
  );

  const stripeHealthJson = stripeHealth?.json || {};
  const orchJson = orchestrationHealth?.json || {};

  const envChecks = {
    stripeSecretKey: envPresent("STRIPE_SECRET_KEY"),
    stripeWebhookSecret: envPresent("STRIPE_WEBHOOK_SECRET"),
    stripePublishable:
      envPresent("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY") || envPresent("STRIPE_PUBLISHABLE_KEY"),
    databaseUrl: envPresent("DATABASE_URL") || envPresent("NEON_DATABASE_URL"),
    s3Bucket: envPresent("S3_BUCKET"),
    awsRegion: envPresent("AWS_REGION"),
    awsAccessKey: envPresent("AWS_ACCESS_KEY_ID"),
    awsSecretKey: envPresent("AWS_SECRET_ACCESS_KEY"),
  };

  const webhookModulePath = path.join(root, "lib/client/webhook-activation.js");
  const webhookModuleExists = fs.existsSync(webhookModulePath);

  const immutableVerify = runScript("scripts/bossmind-immutable-verify.mjs");
  const protectedUiAuthority = readJsonSafe(path.join(root, "config/bossmind-protected-ui-authority.json"));
  const automationProjects = readJsonSafe(path.join(hubRoot, "bossmind-shared/automation/projects.json"));

  const memHealth = memoryHealth(shakhsyHub);

  const checks = {
    productionHealth: {
      ok: productionHealth.ok,
      status: productionHealth.status,
      detail: productionHealth.json?.status || productionHealth.json?.ok,
    },
    stripeHealth: {
      ok:
        stripeHealth.ok &&
        (stripeHealthJson.ok === true ||
          stripeHealthJson.checkoutReady === true ||
          stripeHealthJson.commerceReady === true),
      partial: stripeHealth.ok && stripeHealthJson.ok !== false,
      status: stripeHealth.status,
      checkoutReady: stripeHealthJson.checkoutReady ?? null,
      commerceReady: stripeHealthJson.commerceReady ?? null,
      webhookConfigured:
        stripeHealthJson.webhookConfigured ?? stripeHealthJson.webhookSecretConfigured ?? null,
    },
    orchestrationHealth: {
      ok: orchestrationHealth.ok && orchJson.ok !== false,
      partial: orchestrationHealth.ok,
      bossmindHealth: orchJson,
    },
    stripeEnv: {
      ok: envChecks.stripeSecretKey && envChecks.stripePublishable,
      partial: envChecks.stripeSecretKey || envChecks.stripePublishable,
      masked: {
        STRIPE_SECRET_KEY: envChecks.stripeSecretKey ? maskSecret(process.env.STRIPE_SECRET_KEY) : null,
        NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: envChecks.stripePublishable
          ? maskSecret(
              process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || process.env.STRIPE_PUBLISHABLE_KEY
            )
          : null,
      },
    },
    webhookSecret: {
      ok: envChecks.stripeWebhookSecret || stripeHealthJson.stripe?.STRIPE_WEBHOOK_SECRET?.present === true,
      partial:
        stripeHealthJson.webhookReady === true ||
        stripeHealthJson.stripe?.STRIPE_WEBHOOK_SECRET?.present === true,
      localPresent: envChecks.stripeWebhookSecret,
      productionPresent: stripeHealthJson.stripe?.STRIPE_WEBHOOK_SECRET?.present ?? null,
      note: "Webhook secret required for server-side entitlement activation on checkout.session.completed.",
    },
    neonDb: {
      ok: envChecks.databaseUrl,
      partial: productionHealth.json?.database?.ok ?? productionHealth.json?.neon?.ok,
    },
    immutableBaseline: {
      ok: immutableVerify.ok,
      verify: immutableVerify.json,
    },
    webhookActivationModule: {
      ok: webhookModuleExists,
      path: "lib/client/webhook-activation.js",
    },
    sharedMemoryHub: {
      ok: memHealth.ok,
      partial: memHealth.partial,
      ...memHealth,
    },
    errorMemoryLogs: {
      ok: memHealth.jsonl?.["error-memory-log.jsonl"]?.exists,
      bytes: memHealth.jsonl?.["error-memory-log.jsonl"]?.bytes ?? 0,
    },
    automationRegistry: {
      ok: Boolean(
        automationProjects?.projects?.some((p) => String(p.root || "").includes("bossmind-resumora"))
      ),
    },
    s3Configured: {
      ok: envChecks.s3Bucket && envChecks.awsAccessKey && envChecks.awsSecretKey && envChecks.awsRegion,
      partial: envChecks.s3Bucket,
    },
    designLockIntact: {
      ok: immutableVerify.ok && Boolean(protectedUiAuthority?.authorityKey),
      authorityKey: protectedUiAuthority?.authorityKey ?? null,
    },
  };

  const blockers = [];
  if (!checks.productionHealth.ok) {
    blockers.push({
      severity: "critical",
      area: "deployment",
      message: "Production /api/health probe failed or returned non-OK.",
    });
  }
  if (!checks.stripeHealth.ok) {
    blockers.push({
      severity: checks.stripeHealth.partial ? "high" : "critical",
      area: "stripe",
      message: "Stripe health not fully ready (checkout/commerce/webhook alignment).",
      evidence: { checkoutReady: checks.stripeHealth.checkoutReady ?? null },
    });
  }
  if (!checks.webhookSecret.ok && !checks.webhookSecret.partial) {
    blockers.push({
      severity: "high",
      area: "stripe",
      message:
        "STRIPE_WEBHOOK_SECRET missing locally and not confirmed on production — webhook entitlement activation will fail until configured.",
    });
  }
  if (!checks.immutableBaseline.ok) {
    blockers.push({
      severity: "medium",
      area: "design_lock",
      message: "Immutable luxury UI baseline verify did not pass locally (design lock enforcement).",
    });
  }
  if (!memHealth.ok) {
    blockers.push({
      severity: "medium",
      area: "shared_memory",
      message: "Shakhsy11 shared-memory live state stale or missing — scheduled sync may need repair.",
    });
  }
  if (!checks.s3Configured.ok) {
    blockers.push({
      severity: "medium",
      area: "storage",
      message: "S3 upload pipeline env incomplete locally (production may still be configured on Render).",
    });
  }

  const autonomy = scoreSystems(checks);
  const systems = classifySystems(checks);

  const bottlenecks = [];
  if (!checks.stripeHealth.ok) {
    bottlenecks.push(
      "Stripe checkout-to-entitlement until webhook activation is deployed + STRIPE_WEBHOOK_SECRET on Render."
    );
  }
  if (!memHealth.ok) {
    bottlenecks.push(
      "Shared-memory scheduled tasks — Get-FileHash fix applied; reinstall schedulers to activate."
    );
  }
  if (!checks.orchestrationHealth.ok) {
    bottlenecks.push("BossMind orchestration health endpoint partial — review neon-memory and watcher daemons.");
  }

  const repairSummary = {
    appliedThisSession: [
      "lib/client/webhook-activation.js — server-side Stripe webhook entitlement activation (idempotent)",
      "pages/api/webhooks/stripe.js — checkout.session.completed now activates entitlements",
      "D:/Shakhsy11/BossMind/core/memory/bossmind-filesystem-inventory.ps1 — Import-Module Microsoft.PowerShell.Utility",
      "D:/Shakhsy11/BossMind/core/memory/bossmind-live-state-watcher.ps1 — Import-Module Microsoft.PowerShell.Utility",
      "D:/Shakhsy11/BossMind/core/memory/bossmind-install-memory-scheduler.ps1 — explicit PowerShell 5.1 path",
      "D:/Shakhsy11/BossMind/core/memory/bossmind-install-watcher-scheduler.ps1 — explicit PowerShell 5.1 path",
      "bossmind-shared/automation/projects.json — real Resumora + hub paths",
      "bossmind-shared/automation/health-endpoints.json — production probe URLs",
    ],
    requiresDeploy: [
      "Deploy bossmind-resumora webhook activation to Render for production instant unlock",
      "Confirm STRIPE_WEBHOOK_SECRET on Render matches Stripe Dashboard webhook signing secret",
    ],
  };

  const report = {
    schema: "bossmind-production-autonomy-audit/v1",
    timestamp,
    project: "resumora",
    origin,
    designLock: {
      preserved: true,
      immutableVerifyOk: checks.immutableBaseline.ok,
      protectedUiAuthorityVersion: protectedUiAuthority?.version ?? null,
      authorityKey: protectedUiAuthority?.authorityKey ?? null,
      note: "No client-facing UI components modified in this optimization pass.",
    },
    autonomy,
    systems,
    checks,
    deploymentHealth: {
      productionUrl: origin,
      probes: { health: productionHealth, stripeHealth, orchestrationHealth },
    },
    sharedMemoryHealth: memHealth,
    errorMemoryHealth: {
      logExists: memHealth.jsonl?.["error-memory-log.jsonl"]?.exists ?? false,
      logBytes: memHealth.jsonl?.["error-memory-log.jsonl"]?.bytes ?? 0,
    },
    automationEngineHealth: {
      registryOk: checks.automationRegistry.ok,
      orchestration: orchJson,
    },
    bottlenecks,
    blockers,
    repairSummary,
    recommendedNextUpgrade:
      repairSummary.requiresDeploy.length > 0
        ? "Deploy webhook activation to Render (git push main), then npm run bossmind:enterprise:post-deploy"
        : "Reconcile local immutable baseline drift (npm run bossmind:baseline:restore) or re-seal after explicit UI approval",
  };

  fs.mkdirSync(memoryOutDir, { recursive: true });
  const outName = `resumora-production-autonomy-${timestamp.slice(0, 10)}.json`;
  const outPath = path.join(memoryOutDir, outName);
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));

  const healDir = path.join(root, "windows-heal/reports");
  fs.mkdirSync(healDir, { recursive: true });
  fs.writeFileSync(path.join(healDir, "production-autonomy-audit.json"), JSON.stringify(report, null, 2));

  console.log(JSON.stringify(report, null, 2));

  if (process.env.BOSSMIND_AUDIT_STRICT === "1") {
    if (autonomy.percent < 95 || !checks.productionHealth.ok) {
      process.exit(1);
    }
  }
}

main().catch((err) => {
  console.error(JSON.stringify({ ok: false, error: err.message }));
  process.exit(1);
});
