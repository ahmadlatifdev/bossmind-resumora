#!/usr/bin/env node
/**
 * BossMind production backup + recovery — full activation (single entrypoint).
 *
 * Phases (in-process):
 *   1–2  Multi-project verified backup + 30d retention (delegates to bossmind-backup-daily)
 *   4–5  Preservation validate per reachable project + anchor simulate + checksum proof (manifest)
 *   9    Consolidated production report
 *   10   Optional Neon lock (requires explicit consent env)
 *
 * Anti-Leak: never backs up .env / secrets (filtered in bossmind-backup-daily).
 * Neon DB dumps / Render env exports: operator-side (not in this script).
 *
 *   npm run bossmind:backup:activate-full
 *
 * Env:
 *   BOSSMIND_BOSSMIND_ROOT — hub e.g. D:/BossMind (optional; anchor-only if unset)
 *   BOSSMIND_BACKUP_CONFIRM_PRODUCTION_LOCK=1 — run Neon architecture lock after success
 *   NEON_DATABASE_URL — required for lock + error_memory self-heal paths
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const anchorRoot = path.resolve(path.join(__dirname, ".."));

function loadProjectEnv() {
  try {
    require(path.join(anchorRoot, "lib/shared/load-project-env.js")).loadProjectEnv(anchorRoot);
  } catch {
    /* optional */
  }
}

function parseLastJsonObject(s) {
  const text = String(s || "").trim();
  if (!text) return null;
  const lines = text.split("\n");
  for (let i = lines.length - 1; i >= 0; i--) {
    const t = lines[i].trim();
    if (!t.startsWith("{")) continue;
    try {
      return JSON.parse(t);
    } catch {
      /* continue */
    }
  }
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function runNode(scriptRel, extraEnv = {}, extraArgs = []) {
  const script = path.join(anchorRoot, scriptRel);
  const r = spawnSync(process.execPath, [script, ...extraArgs], {
    cwd: anchorRoot,
    encoding: "utf8",
    env: { ...process.env, ...extraEnv },
    maxBuffer: 48 * 1024 * 1024,
  });
  const parsed = parseLastJsonObject(r.stdout);
  return {
    ok: r.status === 0,
    status: r.status ?? 1,
    stdout: (r.stdout || "").slice(-12000),
    stderr: (r.stderr || "").slice(-4000),
    parsed,
  };
}

function runNpm(script, extraEnv = {}) {
  const r = spawnSync(`npm run ${script}`, {
    cwd: anchorRoot,
    encoding: "utf8",
    shell: true,
    env: { ...process.env, ...extraEnv },
    maxBuffer: 48 * 1024 * 1024,
  });
  return { ok: r.status === 0, status: r.status ?? 1, stdout: (r.stdout || "").slice(-12000), stderr: (r.stderr || "").slice(-4000) };
}

function loadRegistry() {
  const p = path.join(anchorRoot, "config", "bossmind-backup-projects-registry.json");
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function resolveProjectRoot(entry, hub) {
  if (entry.anchor) return anchorRoot;
  if (!hub) return null;
  return path.resolve(hub, entry.relativePath);
}

function main() {
  loadProjectEnv();
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const registry = loadRegistry();
  const hubRaw = process.env.BOSSMIND_BOSSMIND_ROOT || "";
  const hub = hubRaw && fs.existsSync(hubRaw) ? path.resolve(hubRaw) : "";

  const phases = {};

  phases.phase1_multiBackup = runNpm("bossmind:backup:multi");

  const validateResults = [];
  for (const p of registry.projects || []) {
    const projectRoot = resolveProjectRoot(p, hub);
    if (!projectRoot || !fs.existsSync(projectRoot) || !fs.existsSync(path.join(projectRoot, "package.json"))) {
      validateResults.push({ id: p.id, skipped: true });
      continue;
    }
    const backupRoot = path.join(projectRoot, ".bossmind", "backups", "rolling-30d");
    const v = runNode("scripts/bossmind-preservation-validate.mjs", {
      BOSSMIND_BACKUP_PROJECT_ROOT: projectRoot,
      BOSSMIND_BACKUP_ROOT: backupRoot,
    });
    validateResults.push({ id: p.id, projectRoot: projectRoot.replace(/\\/g, "/"), ...v });
  }
  phases.phase5_preservationValidateFleet = validateResults;

  phases.phase6_restoreSimulateAnchor = runNode(
    "scripts/bossmind-backup-recovery-simulate.mjs",
    { BOSSMIND_BACKUP_PROJECT_ROOT: anchorRoot },
    ["--strict"]
  );

  phases.phase9_productionReport = runNode("scripts/bossmind-backup-production-report.mjs");

  let phase10 = { skipped: true, reason: "BOSSMIND_BACKUP_CONFIRM_PRODUCTION_LOCK not set to 1" };
  if (process.env.BOSSMIND_BACKUP_CONFIRM_PRODUCTION_LOCK === "1") {
    const notes = `bossmind-backup-activate-full ${stamp}`;
    const lock = spawnSync(
      process.execPath,
      [
        path.join(anchorRoot, "scripts", "bossmind-backup-architecture-lock.mjs"),
        "--i-understand-external-hub",
        `--notes=${notes}`,
      ],
      { cwd: anchorRoot, encoding: "utf8", env: process.env, shell: false }
    );
    phase10 = {
      ok: lock.status === 0,
      status: lock.status,
      stdout: (lock.stdout || "").slice(-4000),
      stderr: (lock.stderr || "").slice(-2000),
    };
  }

  const validateOk = validateResults.every((x) => x.skipped || x.ok);
  const sim = phases.phase6_restoreSimulateAnchor.parsed || {};
  const report = phases.phase9_productionReport.parsed || {};
  const overallOk =
    phases.phase1_multiBackup.ok &&
    validateOk &&
    phases.phase6_restoreSimulateAnchor.ok &&
    phases.phase9_productionReport.ok &&
    (phase10.skipped || phase10.ok);

  const out = {
    version: 1,
    stamp,
    hub: hub || null,
    overallOk,
    antiLeak: {
      note: ".env and secret material paths are never copied by bossmind-backup-daily.",
      neonDump: "Database dumps: use Neon branches / pg_dump outside this repo.",
      renderRailwayExport: "Host env exports: Railway/Render dashboards; never commit.",
    },
    selfHealing: {
      note: "bossmind-backup-daily retries verify failures; final failure writes Neon error_memory when configured.",
    },
    closedLoop: {
      scheduler: ".github/workflows/bossmind-daily-backup.yml cron 06:15 UTC",
      duplicatePrevention: "Concurrency group bossmind-backup-${{ github.repository }} cancel-in-progress: false",
    },
    phases,
    productionReadinessPercent: report.productionReadinessPercent ?? null,
    restoreSimulationOk: sim.ok === true,
    restoreDriftCount: sim.driftCount ?? null,
  };

  const reportDir = path.join(anchorRoot, "windows-heal", "reports");
  fs.mkdirSync(reportDir, { recursive: true });
  const outFile = path.join(reportDir, `bossmind-full-backup-activation-${stamp}.json`);
  fs.writeFileSync(outFile, JSON.stringify(out, null, 2), "utf8");
  out.reportFile = outFile.replace(/\\/g, "/");

  console.log(JSON.stringify(out, null, 2));
  if (!overallOk) process.exit(1);
}

main();
