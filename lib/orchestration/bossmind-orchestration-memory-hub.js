/**
 * Centralized orchestration memory — deployment, repair, runtime classification.
 */
const fs = require("fs");
const path = require("path");

const HUB_ROOT = process.env.BOSSMIND_HUB_ROOT || path.join(process.cwd(), "..");
const MEMORY_DIR = path.join(HUB_ROOT, "13-shared-memory");
const LOG_DIR = path.join(HUB_ROOT, "bossmind-shared/logs");

function ensureDirs() {
  for (const d of [MEMORY_DIR, LOG_DIR, path.join(process.cwd(), ".bossmind/governance")]) {
    fs.mkdirSync(d, { recursive: true });
  }
}

function loadRepairPatterns(cwd) {
  try {
    return JSON.parse(fs.readFileSync(path.join(cwd, "config/bossmind-error-pattern-registry.json"), "utf8"));
  } catch {
    return { patterns: [] };
  }
}

async function recordOrchestrationMemory({
  cwd = process.cwd(),
  neonApi = null,
  eventType = "orchestration.event",
  payload = {},
  failure = null,
  projectKey = "resumora",
} = {}) {
  ensureDirs();
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const entry = {
    schema: "bossmind-orchestration-memory-v1",
    eventType,
    at: new Date().toISOString(),
    projectKey,
    failure,
    payloadSummary: {
      ok: payload.ok,
      failedStage: payload.failedStage,
      gitCommit: payload.proof?.gitCommit || payload.stages?.find((s) => s.id === "commit_verify")?.gitHead,
    },
  };

  const memPath = path.join(MEMORY_DIR, `orchestration-memory-${stamp}.json`);
  fs.writeFileSync(memPath, JSON.stringify({ entry, payload }, null, 2), "utf8");

  const ledgerPath = path.join(cwd, ".bossmind/governance/orchestration-memory-ledger.json");
  let ledger = { entries: [] };
  if (fs.existsSync(ledgerPath)) {
    try {
      ledger = JSON.parse(fs.readFileSync(ledgerPath, "utf8"));
    } catch {
      ledger = { entries: [] };
    }
  }
  ledger.entries.push(entry);
  while (ledger.entries.length > 100) ledger.entries.shift();
  fs.writeFileSync(ledgerPath, JSON.stringify(ledger, null, 2), "utf8");

  const logPath = path.join(LOG_DIR, "orchestration-memory.jsonl");
  fs.appendFileSync(logPath, `${JSON.stringify(entry)}\n`, "utf8");

  if (failure) {
    const patterns = loadRepairPatterns(cwd);
    const match = (patterns.patterns || []).find((p) => p.id === failure.type || p.symptom?.includes(failure.stage));
    if (match) {
      entry.reusedPattern = match.id;
      entry.repairStrategy = match.repairStrategy;
    }
  }

  if (neonApi?.saveEvent) {
    try {
      await neonApi.saveEvent({
        projectKey,
        eventType: `bossmind.${eventType}`,
        severity: payload.ok ? "info" : "error",
        source: "orchestration-memory-hub",
        eventKey: `${eventType}:${stamp}`,
        payload: entry,
      });
    } catch {
      /* non-blocking */
    }
  }

  return { memPath, entry };
}

function getOrchestrationIntelligence(cwd = process.cwd()) {
  const ledgerPath = path.join(cwd, ".bossmind/governance/orchestration-memory-ledger.json");
  if (!fs.existsSync(ledgerPath)) return { entries: [], repairReuseCount: 0 };
  const ledger = JSON.parse(fs.readFileSync(ledgerPath, "utf8"));
  const failures = (ledger.entries || []).filter((e) => e.eventType?.includes("failed"));
  const stable = (ledger.entries || []).filter((e) => e.eventType?.includes("stable"));
  return {
    entries: ledger.entries,
    failureCount: failures.length,
    stableCount: stable.length,
    lastFailure: failures[failures.length - 1] || null,
    lastStable: stable[stable.length - 1] || null,
  };
}

module.exports = { recordOrchestrationMemory, getOrchestrationIntelligence };
