#!/usr/bin/env node
/**
 * BossMind backup — EXECUTION PROOF (read-only, local workspace).
 *
 * Confirms what the repo + local .bossmind trees can prove. Does not call GitHub Actions API
 * (no token) and does not prove CI ran unless you provide exported run logs separately.
 *
 *   node scripts/bossmind-backup-execution-proof.mjs
 *   BOSSMIND_BACKUP_PROJECT_ROOT=D:\\other\\repo node scripts/bossmind-backup-execution-proof.mjs
 *
 * Writes: windows-heal/reports/bossmind-backup-execution-proof-<stamp>.json
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const anchorRoot = path.resolve(path.join(__dirname, ".."));
const root = process.env.BOSSMIND_BACKUP_PROJECT_ROOT
  ? path.resolve(process.env.BOSSMIND_BACKUP_PROJECT_ROOT)
  : anchorRoot;
const backupRoot = path.resolve(
  root,
  process.env.BOSSMIND_BACKUP_ROOT || path.join(".bossmind", "backups", "rolling-30d")
);
const retentionDays = Number(process.env.BOSSMIND_BACKUP_RETENTION_DAYS || 30);
const logPath = path.join(backupRoot, "daily-backup.log.jsonl");
const runsDir = path.join(backupRoot, "runs");
const protectedDir = path.join(backupRoot, "protected");
const manifestPath = path.join(protectedDir, "latest-verified-manifest.json");
const workflowPath = path.join(anchorRoot, ".github", "workflows", "bossmind-daily-backup.yml");

function readJsonl(path) {
  if (!fs.existsSync(path)) return [];
  return fs
    .readFileSync(path, "utf8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return { parseError: true, line: line.slice(0, 200) };
      }
    });
}

function analyzeLog(entries) {
  const ok = entries.filter((e) => e && !e.parseError && e.verifyOk === true);
  const fail = entries.filter((e) => e && !e.parseError && e.verifyOk === false);
  const bad = entries.filter((e) => e && e.parseError);
  const last = entries.length ? entries[entries.length - 1] : null;
  let oldestOkTs = null;
  let newestOkTs = null;
  for (const e of ok) {
    const rid = e.runId || "";
    const m = rid.match(/^(\d{4}-\d{2}-\d{2})T/);
    if (m) {
      const d = new Date(m[1] + "T00:00:00.000Z").getTime();
      if (!oldestOkTs || d < oldestOkTs) oldestOkTs = d;
      if (!newestOkTs || d > newestOkTs) newestOkTs = d;
    }
  }
  return {
    totalLines: entries.length,
    verifyOkCount: ok.length,
    verifyFailCount: fail.length,
    parseErrorCount: bad.length,
    lastEntry: last,
    oldestOkDayUtc: oldestOkTs ? new Date(oldestOkTs).toISOString().slice(0, 10) : null,
    newestOkDayUtc: newestOkTs ? new Date(newestOkTs).toISOString().slice(0, 10) : null,
  };
}

function scanRunsDir() {
  if (!fs.existsSync(runsDir)) {
    return { runDirs: [], verifiedOlderThanRetention: [], note: "runs_dir_missing" };
  }
  const cutoff = Date.now() - retentionDays * 86400_000;
  const dirs = [];
  const oldVerified = [];
  for (const e of fs.readdirSync(runsDir, { withFileTypes: true })) {
    if (!e.isDirectory()) continue;
    const id = e.name;
    const p = path.join(runsDir, id);
    const st = fs.statSync(p);
    const verified = fs.existsSync(path.join(p, ".verified"));
    dirs.push({ id, mtimeMs: st.mtimeMs, verified });
    if (verified && st.mtimeMs < cutoff) oldVerified.push({ id, mtimeIso: new Date(st.mtimeMs).toISOString() });
  }
  dirs.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return { runDirs: dirs, verifiedOlderThanRetention: oldVerified };
}

function workflowEvidence() {
  if (!fs.existsSync(workflowPath)) {
    return { present: false, path: workflowPath };
  }
  const text = fs.readFileSync(workflowPath, "utf8");
  const hasCron = /schedule:\s*\n\s*cron:/m.test(text) || text.includes("cron:");
  const hasActivateFull = text.includes("bossmind:backup:activate-full");
  const hasSnapshotBranchJob = /snapshot|orphan|git push.*bossmind\/preservation/i.test(text);
  return {
    present: true,
    path: workflowPath.replace(/\\/g, "/"),
    hasScheduleCron: hasCron,
    runsActivateFull: hasActivateFull,
    githubSnapshotBranchAutomation: hasSnapshotBranchJob,
  };
}

function runPreserveValidate() {
  const r = spawnSync(process.execPath, [path.join(anchorRoot, "scripts", "bossmind-preservation-validate.mjs")], {
    cwd: anchorRoot,
    encoding: "utf8",
    env: { ...process.env, BOSSMIND_BACKUP_PROJECT_ROOT: root, BOSSMIND_BACKUP_ROOT: backupRoot },
    maxBuffer: 16 * 1024 * 1024,
  });
  let parsed = null;
  try {
    parsed = JSON.parse((r.stdout || "").trim());
  } catch {
    parsed = { parseError: true, tail: (r.stdout || "").slice(-800) };
  }
  return { ok: r.status === 0, status: r.status, parsed, stderrTail: (r.stderr || "").slice(-800) };
}

function main() {
  const logEntries = readJsonl(logPath);
  const logStats = analyzeLog(logEntries);
  const runs = scanRunsDir();
  const wf = workflowEvidence();
  const manifestPresent = fs.existsSync(manifestPath);
  const validate = runPreserveValidate();

  const retentionPolicyInCode = {
    retentionDaysDefault: retentionDays,
    pruneRequiresVerifiedRun: true,
    skipsLastGoodRunId: true,
    respectsPermanentMarker: true,
    note: "Proof of historical prunes for 30 continuous days requires an external CI audit or retained metrics store; this script only inspects current disk + log file.",
  };

  const proof = {
    generatedAt: new Date().toISOString(),
    projectRoot: root.replace(/\\/g, "/"),
    backupRoot: backupRoot.replace(/\\/g, "/"),
    memoryCorrection: {
      databaseAuthorityInRepo: "Neon Postgres (shared memory / event_log). Supabase is not the Resumora authority in this tree.",
    },
    retentionPolicyInCode,
    localDiskEvidence: {
      manifestPresent,
      dailyBackupLogPresent: fs.existsSync(logPath),
      logStats,
      runsSummary: {
        totalRunDirs: runs.runDirs.length,
        verifiedRunDirs: runs.runDirs.filter((d) => d.verified).length,
        verifiedDirsWithMtimeOlderThanRetentionWindow: runs.verifiedOlderThanRetention.length,
      },
      latestPreservationValidate: validate.parsed,
    },
    schedulerDefinition: wf,
    confirmedVsNot: {
      backupStrategyAndScriptsInRepo: true,
      dailySchedulerDefinedInGitHubWorkflow: wf.hasScheduleCron === true,
      activateFullStepPresent: wf.runsActivateFull === true,
      localVerifyOkOnDemand: validate.ok === true,
      manifestIntegrityMatchesBackup: validate.parsed?.ok === true,
      manifestDriftCount: typeof validate.parsed?.driftCount === "number" ? validate.parsed.driftCount : null,
      dailyBackupsExecutingSuccessfullyOnGitHub: "NOT_PROVEN_HERE — requires Actions run history or exported logs",
      thirtyDayRetentionContinuouslyVerified: "NOT_PROVEN_HERE — see retentionPolicyInCode + disk sample only",
      autoRestoreVerificationRanThisInvocation: validate.ok,
      backupLogsValidatingAutomatically: Boolean(fs.existsSync(logPath) && logStats.verifyOkCount > 0),
      rollbackSnapshotsRotatingDaily: "NOT_IMPLEMENTED_AS_GIT_BRANCHES — rolling run dirs under .bossmind/backups only",
      githubSnapshotAutomation: wf.githubSnapshotBranchAutomation === true,
      neonSqlDumpBackup: "NOT_IN_REPO — use Neon branch / pg_dump operationally",
      renderRailwayConfigSecretExport: "NOT_IN_REPO — dashboard export only",
    },
    honestStatusTable: {
      backupStrategy: "active_in_repo",
      backupArchitecture: "defined",
      dailyExecutionProof: "needs_github_actions_ui_or_api",
      thirtyDayRetentionProof: "needs_long_window_audit",
      autoRestoreVerification:
        validate.parsed?.ok === true
          ? "passed_last_validate"
          : validate.parsed?.driftCount
            ? `drift_${validate.parsed.driftCount}`
            : "failed_or_skipped",
      productionGradeGuarantee: "not_claimed",
    },
  };

  const outDir = path.join(anchorRoot, "windows-heal", "reports");
  fs.mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outFile = path.join(outDir, `bossmind-backup-execution-proof-${stamp}.json`);
  fs.writeFileSync(outFile, JSON.stringify(proof, null, 2), "utf8");
  proof.reportFile = outFile.replace(/\\/g, "/");
  console.log(JSON.stringify(proof, null, 2));
}

main();
