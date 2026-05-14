#!/usr/bin/env node
/**
 * BossMind Memory Recovery & Preservation (orchestrator).
 *
 * Chains repo-safe steps: rolling backup, preservation validate, antileak (non-fatal),
 * optional git tag snapshot, git remotes/status/fetch, D:\\BossMind inventory, deploy config
 * markers, bounded Neon exports, optional Chrome inventory / User Data backup via PowerShell.
 *
 * Does NOT: export Gmail, n8n, ChatGPT, or Cursor chat DBs (out of repo / need separate tools).
 *
 * Usage:
 *   node scripts/bossmind-memory-recovery-preservation.mjs
 *   --skip-backup-daily
 *   --skip-preservation-validate
 *   --skip-antileak
 *   --skip-git-snapshot
 *   --skip-git-fetch
 *   --skip-bookmark-backup
 *   --chrome-backup-user-data
 *   --chrome-backup-full
 *   --chrome-allow-running
 *   --chrome-no-shortcuts
 *   --strict  (exit 1 if backup failed or summary.ok false)
 *
 * Env:
 *   BOSSMIND_LOCAL_ROOT — default D:\\BossMind
 *   BOSSMIND_PROJECT_KEY — default resumora
 *   NEON_DATABASE_URL — enables Neon export slice
 *   BOSSMIND_MEMORY_RUN_HUB_INDEX=1 — also run bossmind-hub-index.mjs (needs SHAKHSY_HUB if used)
 */
import { spawnSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";
import { neon } from "@neondatabase/serverless";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const require = createRequire(import.meta.url);

const argv = new Set(process.argv.slice(2));
const projectKey = process.env.BOSSMIND_PROJECT_KEY || "resumora";
const localRoot = process.env.BOSSMIND_LOCAL_ROOT || path.join("D:", "BossMind");
const stamp = new Date().toISOString().replace(/[:.]/g, "-");

function hasFlag(name) {
  return argv.has(name);
}

function runNode(scriptRel, extraArgs = []) {
  const script = path.join(root, scriptRel);
  const r = spawnSync(process.execPath, [script, ...extraArgs], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
  });
  return { status: r.status ?? 1, stdout: r.stdout || "", stderr: r.stderr || "" };
}

function runNpm(scriptName) {
  const r = spawnSync(`npm run ${scriptName}`, {
    cwd: root,
    encoding: "utf8",
    shell: true,
    maxBuffer: 20 * 1024 * 1024,
  });
  return { status: r.status ?? 1, stdout: r.stdout || "", stderr: r.stderr || "" };
}

function git(args) {
  const r = spawnSync("git", args, { cwd: root, encoding: "utf8" });
  return { ok: r.status === 0, out: (r.stdout || "").trim(), err: (r.stderr || "").trim() };
}

function scanLocalBossMindRoot(absRoot) {
  const wanted = [
    "bossmind-master-admin",
    "bossmind-resumora",
    "resumora-fresh",
    "bossmind-elegancyart",
    "elegancyart",
    "bossmind-ai-video-generator",
    "bossmind-tiktok-ai",
    "bossmind-global-stock",
    "bossmind-shared",
  ];
  const out = {
    root: absRoot,
    rootExists: fs.existsSync(absRoot),
    entries: [],
    matches: [],
  };
  if (!out.rootExists) return out;
  let names = [];
  try {
    names = fs.readdirSync(absRoot, { withFileTypes: true });
  } catch (e) {
    out.readError = String(e?.message || e);
    return out;
  }
  for (const d of names) {
    if (!d.isDirectory()) continue;
    out.entries.push(d.name);
  }
  const lower = new Set(out.entries.map((x) => x.toLowerCase()));
  for (const w of wanted) {
    if (lower.has(w.toLowerCase())) {
      const name = out.entries.find((x) => x.toLowerCase() === w.toLowerCase());
      const full = path.join(absRoot, name);
      const gitDir = path.join(full, ".git");
      const isGit = fs.existsSync(gitDir);
      let head = null;
      let dirty = null;
      if (isGit) {
        const h = git(["-C", full, "rev-parse", "--short", "HEAD"]);
        head = h.ok ? h.out : null;
        const st = git(["-C", full, "status", "--porcelain"]);
        dirty = st.ok ? (st.out ? st.out.split("\n").filter(Boolean).length : 0) : null;
      }
      out.matches.push({ name, path: full, isGit, head, dirtyLines: dirty });
    }
  }
  return out;
}

function listDeployMarkers() {
  const rels = [
    "docs/RAILWAY_DEPLOY.md",
    "railway.json",
    "render.yaml",
    "railway.toml",
    ".github/workflows",
  ];
  const files = [];
  for (const rel of rels) {
    const abs = path.join(root, ...rel.split("/"));
    if (!fs.existsSync(abs)) continue;
    const st = fs.statSync(abs);
    if (st.isDirectory()) {
      let wf = [];
      try {
        wf = fs.readdirSync(abs).filter((f) => f.endsWith(".yml") || f.endsWith(".yaml"));
      } catch {
        wf = [];
      }
      files.push({ path: rel, type: "dir", workflowCount: wf.length });
    } else {
      files.push({ path: rel, type: "file", bytes: st.size });
    }
  }
  return files;
}

function loadEnvExampleKeys() {
  const p = path.join(root, ".env.example");
  if (!fs.existsSync(p)) return [];
  const text = fs.readFileSync(p, "utf8");
  const keys = [];
  const re = /^\s*([A-Z0-9_]+)\s*=/gim;
  let m;
  while ((m = re.exec(text)) !== null) keys.push(m[1]);
  return [...new Set(keys)].sort();
}

async function neonExportSlice() {
  const url = process.env.NEON_DATABASE_URL;
  if (!url) {
    return { enabled: false, reason: "NEON_DATABASE_URL unset" };
  }
  const neonMem = require(path.join(root, "lib/shared/neon-memory.js"));
  await neonMem.initializeSharedMemory();
  const sql = neon(url);
  const deploymentHistory = await sql`
    SELECT id, commit_hash, environment, status, summary, created_at
    FROM deployment_history
    WHERE project_key = ${projectKey}
    ORDER BY created_at DESC
    LIMIT 40
  `.catch(() => []);
  const missingUpdates = await sql`
    SELECT id, task_key, reason, resolved, created_at
    FROM missing_updates_log
    WHERE project_key = ${projectKey}
    ORDER BY created_at DESC
    LIMIT 60
  `.catch(() => []);

  const events = await neonMem.listRecentEvents({ projectKey, limit: 200 });
  const tasks = await neonMem.listRecentTaskStates({ projectKey, limit: 120 });
  const errors = await neonMem.listKnownErrors({ projectKey, limit: 80 });
  const repairs = await neonMem.listRecentDeploymentRepairLogs({ projectKey, limit: 50 });
  const rollbacks = await neonMem.listLatestRollbackSnapshots({
    projectKey,
    limit: 30,
    pathLike: "%",
  });

  return {
    enabled: true,
    projectKey,
    eventLog: events,
    taskState: tasks,
    errorMemory: errors,
    missingUpdatesLog: missingUpdates,
    deploymentHistory,
    deploymentRepairLog: repairs,
    rollbackSnapshotsMeta: rollbacks,
  };
}

function runChromeAssist(extraArgs) {
  const ps1 = path.join(root, "scripts", "chrome-official-repair-assist.ps1");
  if (!fs.existsSync(ps1)) {
    return { ok: false, error: "chrome-official-repair-assist.ps1 missing" };
  }
  const args = ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", ps1, ...extraArgs];
  const r = spawnSync("powershell.exe", args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 50 * 1024 * 1024,
    timeout: hasFlag("--chrome-backup-user-data") ? undefined : 180000,
  });
  return {
    ok: r.status === 0,
    status: r.status,
    stdout: (r.stdout || "").slice(-8000),
    stderr: (r.stderr || "").slice(-4000),
  };
}

function ensureDir(d) {
  fs.mkdirSync(d, { recursive: true });
}

function writeLatestStableLock(reportPath, summary) {
  const lockDir = path.join(root, ".bossmind", "recovery");
  ensureDir(lockDir);
  const lock = {
    version: 1,
    stamp,
    createdAt: new Date().toISOString(),
    reportPath: path.relative(root, reportPath).replace(/\\/g, "/"),
    summary,
  };
  fs.writeFileSync(path.join(lockDir, "latest-stable-memory-recovery.json"), JSON.stringify(lock, null, 2), "utf8");
}

async function main() {
  const healState = path.join(root, "windows-heal", "state");
  ensureDir(healState);
  const reportPath = path.join(healState, `bossmind-memory-recovery-${stamp}.json`);

  const report = {
    version: 1,
    stamp,
    projectKey,
    objective: "BossMind memory recovery and preservation (repo-orchestrated)",
    limits: [
      "Cursor favorite chats, DeepSeek app threads, and ChatGPT history are not inside Chrome User Data or this repo.",
      "Gmail labels/filters and n8n flows require Google/n8n export outside this script.",
      "Railway/Render live env vars and service IDs are on the host dashboards unless mirrored in local env (never printed here).",
    ],
    steps: {},
    localBossMindScan: scanLocalBossMindRoot(localRoot),
    deployMarkers: listDeployMarkers(),
    envExampleKeys: loadEnvExampleKeys(),
    operatorManual: [
      "Chrome full profile tree: close Chrome, run npm run bossmind:chrome:official-repair-assist -- -BackupUserData -BackupMode Lean",
      "Chrome bookmarks: npm run bossmind:chrome:bookmark-backup (Chrome closed)",
      "Gmail / Workspace: Google Takeout or Admin console (mail, labels)",
      "n8n: export workflows JSON from n8n UI",
      "Railway/Render: download env backup from each service settings (do not commit secrets)",
    ],
  };

  if (!hasFlag("--skip-backup-daily")) {
    const b = runNpm("bossmind:backup:daily");
    report.steps.backupDaily = { ok: b.status === 0, status: b.status, tail: (b.stdout + b.stderr).slice(-6000) };
  } else {
    report.steps.backupDaily = { skipped: true };
  }

  const backupFailed = report.steps.backupDaily?.ok === false;
  if (!hasFlag("--skip-preservation-validate") && !backupFailed) {
    const v = runNpm("bossmind:preservation:validate");
    report.steps.preservationValidate = { ok: v.status === 0, status: v.status, tail: (v.stdout + v.stderr).slice(-4000) };
  } else {
    report.steps.preservationValidate = { skipped: true };
  }

  if (!hasFlag("--skip-antileak")) {
    const a = runNpm("bossmind:antileak");
    report.steps.antileak = { ok: a.status === 0, status: a.status, tail: (a.stdout + a.stderr).slice(-4000) };
  } else {
    report.steps.antileak = { skipped: true };
  }

  if (!hasFlag("--skip-git-snapshot")) {
    const s = runNode("scripts/bossmind-snapshot-save.mjs", [`memory-recovery-${stamp}`]);
    report.steps.gitTagSnapshot = { ok: s.status === 0, status: s.status, tail: (s.stdout + s.stderr).slice(-4000) };
  } else {
    report.steps.gitTagSnapshot = { skipped: true };
  }

  const branch = git(["rev-parse", "--abbrev-ref", "HEAD"]);
  const head = git(["rev-parse", "HEAD"]);
  const remotes = git(["remote", "-v"]);
  report.git = {
    branch: branch.ok ? branch.out : null,
    head: head.ok ? head.out : null,
    remotes: remotes.ok ? remotes.out : null,
  };

  if (!hasFlag("--skip-git-fetch")) {
    const f = git(["fetch", "--all", "--prune"]);
    report.steps.gitFetch = { ok: f.ok, err: f.err || undefined };
  } else {
    report.steps.gitFetch = { skipped: true };
  }

  if (!hasFlag("--skip-bookmark-backup")) {
    const bm = runNode("scripts/chrome-bookmark-consolidation.mjs", ["--backup-bookmarks"]);
    report.steps.chromeBookmarkBackup = { ok: bm.status === 0, status: bm.status, tail: (bm.stdout + bm.stderr).slice(-4000) };
  } else {
    report.steps.chromeBookmarkBackup = { skipped: true };
  }

  if (hasFlag("--chrome-backup-user-data")) {
    const psArgs = ["-BackupUserData", "-BackupMode", hasFlag("--chrome-backup-full") ? "Full" : "Lean"];
    if (hasFlag("--chrome-allow-running")) psArgs.push("-AllowChromeRunning");
    report.steps.chromeUserDataBackup = runChromeAssist(psArgs);
  } else {
    report.steps.chromeUserDataInventory = runChromeAssist(hasFlag("--chrome-no-shortcuts") ? [] : ["-DumpChromeShortcuts"]);
  }

  if (process.env.BOSSMIND_MEMORY_RUN_HUB_INDEX === "1") {
    const h = runNode("scripts/bossmind-hub-index.mjs");
    report.steps.hubIndex = { ok: h.status === 0, status: h.status, tail: (h.stdout + h.stderr).slice(-4000) };
  }

  try {
    report.neon = await neonExportSlice();
  } catch (e) {
    report.neon = { enabled: false, error: String(e?.message || e) };
  }

  const criticalBackupSkipped = hasFlag("--skip-backup-daily");
  const preservationFailed =
    report.steps.preservationValidate &&
    !report.steps.preservationValidate.skipped &&
    report.steps.preservationValidate.ok === false;
  const warnings = [];
  if (!report.steps.antileak?.skipped && report.steps.antileak?.ok === false) {
    warnings.push(
      "antileak reported changes under protected/forbidden rules; resolve diffs or use BOSSMIND_PROTECTED_EDIT_OK=1 only with intent."
    );
  }
  report.summary = {
    ok: !backupFailed && !preservationFailed,
    criticalBackupSkipped,
    backupFailed,
    preservationFailed: Boolean(preservationFailed),
    antileakOk: report.steps.antileak?.ok !== false || report.steps.antileak?.skipped,
    warnings,
    neonOk:
      !report.neon?.error &&
      (report.neon?.enabled === false || Array.isArray(report.neon?.eventLog)),
  };

  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8");
  writeLatestStableLock(reportPath, report.summary);

  console.log(JSON.stringify({ reportPath: reportPath.replace(/\\/g, "/"), summary: report.summary }, null, 2));

  if (hasFlag("--strict") && !report.summary.ok) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
