#!/usr/bin/env node
/**
 * Aggregate backup health across hub projects (read-only).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const anchorRoot = path.resolve(path.join(__dirname, ".."));
const registryPath = path.join(anchorRoot, "config", "bossmind-backup-projects-registry.json");

function tailJsonl(file, maxLines) {
  if (!fs.existsSync(file)) return [];
  const lines = fs.readFileSync(file, "utf8").trim().split("\n").filter(Boolean);
  return lines.slice(-maxLines).map((l) => {
    try {
      return JSON.parse(l);
    } catch {
      return { raw: l };
    }
  });
}

function countVerifiedRuns(projectRoot) {
  const runsDir = path.join(projectRoot, ".bossmind", "backups", "rolling-30d", "runs");
  if (!fs.existsSync(runsDir)) return { verified: 0, total: 0 };
  let verified = 0;
  let total = 0;
  for (const e of fs.readdirSync(runsDir, { withFileTypes: true })) {
    if (!e.isDirectory()) continue;
    total++;
    if (fs.existsSync(path.join(runsDir, e.name, ".verified"))) verified++;
  }
  return { verified, total };
}

function resolveProjectRoot(entry, hub) {
  if (entry.anchor) return anchorRoot;
  if (!hub) return null;
  return path.resolve(hub, entry.relativePath);
}

function main() {
  const registry = JSON.parse(fs.readFileSync(registryPath, "utf8"));
  const hubRaw = process.env.BOSSMIND_BOSSMIND_ROOT || "";
  const hub = hubRaw && fs.existsSync(hubRaw) ? path.resolve(hubRaw) : "";

  const projects = [];
  for (const p of registry.projects || []) {
    const projectRoot = resolveProjectRoot(p, hub);
    if (!projectRoot || !fs.existsSync(projectRoot)) {
      projects.push({
        id: p.id,
        status: "unavailable",
        reason: !hub ? "hub_unset" : "path_missing",
      });
      continue;
    }
    const backupRoot = path.join(projectRoot, ".bossmind", "backups", "rolling-30d");
    const manifestPath = path.join(backupRoot, "protected", "latest-verified-manifest.json");
    const logPath = path.join(backupRoot, "daily-backup.log.jsonl");
    const runs = countVerifiedRuns(projectRoot);
    let lastOk = null;
    const tail = tailJsonl(logPath, 8);
    for (let i = tail.length - 1; i >= 0; i--) {
      if (tail[i]?.verifyOk === true) {
        lastOk = tail[i];
        break;
      }
    }
    projects.push({
      id: p.id,
      projectRoot: projectRoot.replace(/\\/g, "/"),
      manifestPresent: fs.existsSync(manifestPath),
      lastVerifiedRun: lastOk?.runId || null,
      lastVerifyOk: lastOk?.verifyOk ?? null,
      logTailLines: tail.length,
      runsVerified: runs.verified,
      runsTotal: runs.total,
    });
  }

  const withManifest = projects.filter((x) => x.manifestPresent).length;
  const fleetCoveragePercent = projects.length
    ? Math.round((withManifest / projects.length) * 100)
    : 0;

  const out = {
    ts: new Date().toISOString(),
    hub: hub || null,
    retentionDaysDefault: registry.retentionDaysDefault || 30,
    productionReadinessPercent: fleetCoveragePercent,
    manifestsPresentCount: withManifest,
    antiLeakNote: "Secrets never in rolling file trees; use env + Secret Manager.",
    closedLoopNote: "Neon error_memory receives bossmind.backup.daily.final_failure from anchor script when configured.",
    projects,
  };

  const reportDir = path.join(anchorRoot, "windows-heal", "reports");
  fs.mkdirSync(reportDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const reportFile = path.join(reportDir, `bossmind-backup-production-report-${stamp}.json`);
  fs.writeFileSync(reportFile, JSON.stringify(out, null, 2), "utf8");
  out.reportFile = reportFile.replace(/\\/g, "/");
  console.log(JSON.stringify(out, null, 2));
}

main();
