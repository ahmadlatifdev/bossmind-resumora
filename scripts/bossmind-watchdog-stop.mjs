#!/usr/bin/env node
/**
 * Stop BossMind dev watchdog subtree (PID from .bossmind/watchdog/session.json).
 * Optional: kill listeners on port (Windows) BOSSMIND_WATCHDOG_KILL_PORT_HOLDERS=1
 */
import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import process from "node:process";

const cwd = process.cwd();
const sessionPath = path.join(cwd, ".bossmind", "watchdog", "session.json");
const port = Number(process.env.BOSSMIND_WATCHDOG_PORT || process.env.PORT || 3001);
const killPort = process.env.BOSSMIND_WATCHDOG_KILL_PORT_HOLDERS === "1";

function killTreeWin(pid) {
  try {
    execSync(`taskkill /PID ${pid} /T /F`, { stdio: "inherit", cwd });
  } catch {
    process.exitCode = 1;
  }
}

function freePortWin(p) {
  try {
    execSync(
      `powershell -NoProfile -Command "$p=${p}; $c = Get-NetTCPConnection -LocalPort $p -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique; if ($c) { $c | ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue } }"`,
      { stdio: "inherit", cwd }
    );
  } catch {
    process.exitCode = 1;
  }
}

if (!fs.existsSync(sessionPath)) {
  console.warn(`[bossmind-watchdog-stop] No session file at ${sessionPath}`);
  if (killPort && process.platform === "win32") {
    console.log(`[bossmind-watchdog-stop] Freeing listeners on port ${port}`);
    freePortWin(port);
  }
  process.exit(process.exitCode || 1);
}

const raw = JSON.parse(fs.readFileSync(sessionPath, "utf8"));
const wdPid = raw.watchdogPid;
const childPid = raw.childPid;

if (!wdPid) {
  console.error("[bossmind-watchdog-stop] session missing watchdogPid");
  process.exit(1);
}

console.log(`[bossmind-watchdog-stop] Stopping watchdog PID ${wdPid} (child ${childPid || "n/a"})`);

if (process.platform === "win32") {
  killTreeWin(wdPid);
} else {
  try {
    process.kill(wdPid, "SIGTERM");
  } catch {
    process.exitCode = 1;
  }
}

try {
  fs.unlinkSync(sessionPath);
} catch {
  /* ignore */
}

if (killPort && process.platform === "win32") {
  console.log(`[bossmind-watchdog-stop] Freeing port ${port}`);
  freePortWin(port);
}
