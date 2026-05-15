#!/usr/bin/env node
/**
 * Multi-project BossMind rolling backup orchestrator.
 *
 * - With BOSSMIND_BOSSMIND_ROOT (e.g. D:/BossMind): backs up anchor (this repo) + sibling projects.
 * - Without hub: backs up anchor only (CI / single clone).
 *
 * Invokes scripts/bossmind-backup-daily.mjs with BOSSMIND_BACKUP_PROJECT_ROOT per project.
 *
 *   node scripts/bossmind-multi-project-backup-orchestrator.mjs
 *
 * Env:
 *   BOSSMIND_BOSSMIND_ROOT — optional absolute hub directory
 *   NEON_DATABASE_URL — forwarded to child (optional)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const anchorRoot = path.resolve(path.join(__dirname, ".."));
const registryPath = path.join(anchorRoot, "config", "bossmind-backup-projects-registry.json");

function loadRegistry() {
  const raw = fs.readFileSync(registryPath, "utf8");
  return JSON.parse(raw);
}

function runOneProject({ projectRoot, projectId }) {
  const backupRoot = path.join(projectRoot, ".bossmind", "backups", "rolling-30d");
  const script = path.join(anchorRoot, "scripts", "bossmind-backup-daily.mjs");
  const env = {
    ...process.env,
    BOSSMIND_BACKUP_PROJECT_ROOT: projectRoot,
    BOSSMIND_BACKUP_ROOT: backupRoot,
    BOSSMIND_BACKUP_PROJECT_ID: projectId,
  };
  const r = spawnSync(process.execPath, [script], {
    cwd: anchorRoot,
    encoding: "utf8",
    shell: false,
    env,
    maxBuffer: 32 * 1024 * 1024,
  });
  return {
    ok: r.status === 0,
    status: r.status ?? 1,
    stdout: (r.stdout || "").slice(-12000),
    stderr: (r.stderr || "").slice(-8000),
  };
}

function resolveProjectRoot(entry, hub) {
  if (entry.anchor) return anchorRoot;
  if (!hub) return null;
  return path.resolve(hub, entry.relativePath);
}

function main() {
  const registry = loadRegistry();
  const hubRaw = process.env.BOSSMIND_BOSSMIND_ROOT || "";
  const hub = hubRaw && fs.existsSync(hubRaw) ? path.resolve(hubRaw) : "";

  const results = [];
  for (const p of registry.projects || []) {
    const projectRoot = resolveProjectRoot(p, hub);
    if (!projectRoot || !fs.existsSync(projectRoot)) {
      results.push({
        id: p.id,
        skipped: true,
        reason: !hub ? "hub_unset_or_missing" : "path_not_found",
        expectedPath: hub ? path.join(hub, p.relativePath) : null,
      });
      continue;
    }
    if (!fs.existsSync(path.join(projectRoot, "package.json"))) {
      results.push({ id: p.id, skipped: true, reason: "no_package_json", projectRoot });
      continue;
    }
    const r = runOneProject({ projectRoot, projectId: p.id });
    results.push({ id: p.id, projectRoot, ...r });
  }

  const attempted = results.filter((x) => !x.skipped);
  const okCount = attempted.filter((x) => x.ok).length;
  const totalRegistered = registry.projects?.length || 0;
  const skippedNoHub = results.filter((x) => x.skipped && x.reason === "hub_unset_or_missing").length;
  const lastRunSuccessPercent =
    attempted.length > 0 ? Math.round((okCount / Math.max(1, attempted.length)) * 100) : 0;
  const fleetReachPercent = Math.round((attempted.length / Math.max(1, totalRegistered)) * 100);
  const fleetCoveragePercent = hub
    ? fleetReachPercent
    : Math.round((1 / Math.max(1, totalRegistered)) * 100);
  const out = {
    ok: attempted.length > 0 && okCount === attempted.length,
    hub: hub || null,
    anchorRoot: anchorRoot.replace(/\\/g, "/"),
    projectsTotal: totalRegistered,
    attempted: attempted.length,
    okCount,
    skippedNoHub: hub ? 0 : skippedNoHub,
    lastRunSuccessPercent,
    fleetReachPercent,
    fleetCoveragePercent,
    fleetCoverageNote: hub
      ? `${attempted.length}/${totalRegistered} registry projects had package.json and were backed up.`
      : "Only anchor project ran; set BOSSMIND_BOSSMIND_ROOT for full fleet backups.",
    results,
  };

  const reportDir = path.join(anchorRoot, "windows-heal", "reports");
  fs.mkdirSync(reportDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const reportFile = path.join(reportDir, `bossmind-multi-backup-orchestrator-${stamp}.json`);
  fs.writeFileSync(reportFile, JSON.stringify(out, null, 2), "utf8");
  out.reportFile = reportFile.replace(/\\/g, "/");

  console.log(JSON.stringify(out, null, 2));
  if (!out.ok) process.exit(1);
}

main();
