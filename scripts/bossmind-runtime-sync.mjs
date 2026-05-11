#!/usr/bin/env node
/**
 * BossMind autonomous runtime synchronization loop.
 *
 * Detect -> Compare -> Diagnose -> Repair -> Verify -> Lock
 * - Uses protected surface + luxury homepage files as baseline fingerprint
 * - Optional Neon shared-memory authority (`runtime_authority` table)
 * - Auto-heals local runtime drift with safe cache clear + rebuild
 *
 * Safety: never touches .git history, never deletes source files.
 */
import fs from "fs";
import path from "path";
import crypto from "crypto";
import http from "http";
import https from "https";
import { execSync, spawnSync } from "child_process";
import { createRequire } from "module";
import { fileURLToPath } from "url";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const stateDir = path.join(root, ".bossmind", "runtime-sync");
const statusPath = path.join(stateDir, "status.json");

const projectKey = process.env.BOSSMIND_PROJECT_KEY || "resumora";
const authorityKey = process.env.BOSSMIND_AUTHORITY_KEY || "luxury_ui_baseline";
const origin = (process.env.BOSSMIND_MONITOR_ORIGIN || "http://127.0.0.1:3001").replace(/\/$/, "");
const intervalMs = Number(process.env.BOSSMIND_RUNTIME_SYNC_MS || 60000);
const lockOnStart = process.env.BOSSMIND_RUNTIME_SYNC_LOCK_ON_START !== "0";
const autoHeal = process.env.BOSSMIND_RUNTIME_SYNC_AUTO_HEAL !== "0";
const once = process.argv.includes("--once");
const dryRun = process.argv.includes("--dry-run");

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function writeStatus(obj) {
  fs.mkdirSync(stateDir, { recursive: true });
  fs.writeFileSync(statusPath, JSON.stringify(obj, null, 2), "utf8");
}

function getGitHead() {
  try {
    return execSync("git rev-parse HEAD", { cwd: root, encoding: "utf8" }).trim();
  } catch {
    return "";
  }
}

function loadProtectedPaths() {
  const cfgPath = path.join(root, "config", "bossmind-protected-surface.json");
  let fromCfg = [];
  try {
    const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
    fromCfg = [...(cfg.surfaceLockPaths || []), ...(cfg.shellLockPaths || [])];
  } catch {
    fromCfg = [];
  }
  const mustHave = [
    "components/marketing/HomePage.jsx",
    "components/marketing/SiteChrome.js",
    "components/marketing/sections/TrustMetricsPanel.jsx",
    "components/marketing/sections/UploadPanel.jsx",
    "components/marketing/sections/PricingPanel.jsx",
    "pages/index.js",
    "context/LanguageContext.js",
    "lib/marketing/site-copy.js",
    "styles/resumora-global.css",
    "next.config.ts",
  ];
  return [...new Set([...fromCfg, ...mustHave])].sort();
}

function computeBaselineFingerprint() {
  const files = loadProtectedPaths();
  const parts = [];
  const missing = [];
  for (const rel of files) {
    const abs = path.join(root, ...rel.split("/"));
    if (!fs.existsSync(abs)) {
      missing.push(rel);
      parts.push(`${rel}:<missing>`);
      continue;
    }
    const body = fs.readFileSync(abs, "utf8");
    parts.push(`${rel}:${sha256(body)}`);
  }
  return {
    files,
    missing,
    hash: sha256(parts.join("\n")),
  };
}

function requestText(urlString) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlString);
    const lib = u.protocol === "https:" ? https : http;
    const req = lib.request(
      urlString,
      {
        method: "GET",
        timeout: 30000,
        headers: { "user-agent": "BossMind-runtime-sync/1.0", "accept-language": "en,fr" },
      },
      (res) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          body += chunk;
          if (body.length > 3_000_000) req.destroy(new Error("response too large"));
        });
        res.on("end", () => resolve({ status: res.statusCode || 0, body, headers: res.headers || {} }));
      }
    );
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", reject);
    req.end();
  });
}

async function runtimeProbe() {
  const homeRaw = await requestText(`${origin}/`);
  const homeLocation = String(homeRaw.headers.location || "");
  const home =
    [301, 302, 307, 308].includes(homeRaw.status) && homeLocation
      ? await requestText(new URL(homeLocation, origin).toString())
      : homeRaw;
  const client = await requestText(`${origin}/client`);
  const requiredSnippets = ['id="top"', 'id="trust"', 'id="home-intake"', 'id="pricing"', "rs-cta-strip"];
  const homeOk =
    home.status === 200 && requiredSnippets.every((s) => home.body.includes(s)) && home.body.includes("</html>");
  const redirectLocation = String(client.headers.location || "");
  const clientRedirectOk =
    ([301, 302, 307, 308].includes(client.status) && redirectLocation.endsWith("/")) ||
    (client.status === 200 && requiredSnippets.every((s) => client.body.includes(s)));
  return {
    homeInitialStatus: homeRaw.status,
    homeStatus: home.status,
    clientStatus: client.status,
    clientLocation: redirectLocation,
    homeOk,
    clientRedirectOk,
    ok: homeOk && clientRedirectOk,
  };
}

function runCmd(command, args) {
  const isWin = process.platform === "win32";
  const bin = command === "npm" && isWin ? "npm.cmd" : command;
  const out = spawnSync(bin, args, { cwd: root, stdio: "pipe", encoding: "utf8", shell: false });
  return {
    ok: out.status === 0,
    code: out.status ?? 1,
    stdout: out.stdout || "",
    stderr: out.stderr || "",
  };
}

async function healRuntime(neonApi, context) {
  const actions = [];
  actions.push({ step: "clean_next_cache", result: runCmd("node", ["scripts/clean-next-cache.mjs"]) });
  actions.push({ step: "build", result: runCmd("npm", ["run", "build"]) });
  const probeAfter = await runtimeProbe().catch((err) => ({ ok: false, error: err.message }));
  const healed = Boolean(probeAfter.ok);
  if (neonApi) {
    await neonApi.saveEvent({
      projectKey,
      eventType: "bossmind.runtime_sync.heal",
      severity: healed ? "info" : "error",
      source: "bossmind-runtime-sync",
      eventKey: `heal_${Date.now()}`,
      payload: {
        context,
        actions: actions.map((a) => ({ step: a.step, ok: a.result.ok, code: a.result.code })),
        probeAfter,
      },
    });
    await neonApi.upsertTaskState({
      projectKey,
      taskKey: "bossmind_runtime_sync",
      status: healed ? "healthy" : "degraded",
      assignedAgent: "runtime-sync",
      payload: {
        probeAfter,
        healedAt: new Date().toISOString(),
      },
    });
    await neonApi.saveDeploymentHistory({
      projectKey,
      commitHash: context.gitHead || "",
      status: healed ? "runtime_healed" : "runtime_heal_failed",
      summary: healed
        ? "Runtime drift auto-healed (cache clean + rebuild)."
        : "Runtime drift detected; heal attempt failed.",
      environment: process.env.NODE_ENV === "production" ? "production" : "development",
      metadata: { origin, dryRun: false },
    });
  }
  return { healed, actions, probeAfter };
}

async function syncOnce() {
  const now = new Date().toISOString();
  const gitHead = getGitHead();
  const fingerprint = computeBaselineFingerprint();
  const neonApi = require(path.join(root, "lib/shared/neon-memory.js"));
  const neonInit = await neonApi.initializeSharedMemory();
  const neonEnabled = Boolean(neonInit?.enabled);

  let authority = null;
  if (neonEnabled) {
    authority = await neonApi.getRuntimeAuthority({ projectKey, authorityKey });
    if (!authority && lockOnStart && !dryRun) {
      await neonApi.upsertRuntimeAuthority({
        projectKey,
        authorityKey,
        commitHash: gitHead,
        baselineHash: fingerprint.hash,
        routePath: "/",
        source: "bossmind-runtime-sync",
        payload: {
          files: fingerprint.files,
          seededAt: now,
          mode: "auto_seed",
        },
      });
      authority = await neonApi.getRuntimeAuthority({ projectKey, authorityKey });
    }
  }

  const probe = await runtimeProbe().catch((error) => ({
    ok: false,
    error: error.message,
    homeOk: false,
    clientRedirectOk: false,
  }));

  const drift = {
    authorityMissing: neonEnabled && !authority,
    baselineHashMismatch: Boolean(authority && authority.baseline_hash !== fingerprint.hash),
    missingProtectedFiles: fingerprint.missing.length > 0,
    runtimeMismatch: !probe.ok,
  };
  const hasDrift =
    drift.authorityMissing || drift.baselineHashMismatch || drift.missingProtectedFiles || drift.runtimeMismatch;

  let heal = null;
  if (hasDrift && autoHeal && !dryRun) {
    heal = await healRuntime(neonEnabled ? neonApi : null, {
      gitHead,
      fingerprintHash: fingerprint.hash,
      drift,
      probe,
    });
  }

  const summary = {
    ts: now,
    projectKey,
    origin,
    gitHead,
    neonEnabled,
    authorityKey,
    authority,
    fingerprint,
    probe,
    drift,
    hasDrift,
    autoHeal,
    dryRun,
    heal,
  };
  writeStatus(summary);

  if (neonEnabled) {
    await neonApi.saveEvent({
      projectKey,
      eventType: "bossmind.runtime_sync.cycle",
      severity: hasDrift ? "warn" : "info",
      source: "bossmind-runtime-sync",
      eventKey: `cycle_${Date.now()}`,
      payload: {
        hasDrift,
        drift,
        probe,
        fingerprintHash: fingerprint.hash,
        authorityHash: authority?.baseline_hash || null,
      },
    });
    await neonApi.upsertTaskState({
      projectKey,
      taskKey: "bossmind_runtime_sync",
      status: hasDrift ? "repairing" : "healthy",
      assignedAgent: "runtime-sync",
      payload: {
        hasDrift,
        drift,
        probe,
        fingerprintHash: fingerprint.hash,
        authorityHash: authority?.baseline_hash || null,
        updatedAt: now,
      },
    });
  }

  console.log(JSON.stringify(summary, null, 2));
  return summary;
}

async function main() {
  if (once) {
    const out = await syncOnce();
    process.exit(out.hasDrift && !out.heal?.healed ? 1 : 0);
  }

  console.log(
    `[bossmind-runtime-sync] active ${projectKey} @ ${origin} interval=${intervalMs}ms authority=${authorityKey}`
  );
  await syncOnce();
  setInterval(() => {
    void syncOnce();
  }, intervalMs);
}

main().catch((error) => {
  console.error("[bossmind-runtime-sync]", error);
  process.exit(1);
});

