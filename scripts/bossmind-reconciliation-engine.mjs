#!/usr/bin/env node
/**
 * Standalone production reconciliation — reads Git / last sync / Neon authority / checkpoint.
 * Persists `.bossmind/reconciliation/status.json` and optionally POSTs a promote signal when fully green.
 *
 * Safety: read-only on git; no destructive resets.
 */
import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

const {
  buildReconciliationSnapshot,
  persistReconciliation,
} = require(path.join(root, "lib/orchestration/bossmind-reconciliation.js"));

const projectKey = process.env.BOSSMIND_PROJECT_KEY || "resumora";
const authorityKey = process.env.BOSSMIND_AUTHORITY_KEY || "luxury_ui_baseline";
const checkpointKey = process.env.BOSSMIND_CONTINUITY_KEY || "global_continuity";
const hookUrl = process.env.BOSSMIND_RECONCILE_DEPLOY_HOOK_URL || "";
const hookMin = Number(process.env.BOSSMIND_RECONCILE_DEPLOY_HOOK_MIN_SCORE || 95);
const strictExit = process.env.BOSSMIND_RECONCILE_STRICT_EXIT === "1";

async function notifyHook(snapshot) {
  if (!hookUrl || !snapshot?.ok || snapshot.score < hookMin) {
    return { skipped: true };
  }
  try {
    const res = await fetch(hookUrl, {
      method: "POST",
      headers: { "content-type": "application/json", "user-agent": "BossMind-reconciliation-engine/1.0" },
      body: JSON.stringify({
        event: "bossmind.reconciliation.promote_signal",
        ts: new Date().toISOString(),
        projectKey,
        score: snapshot.score,
        alignmentBlend: snapshot.alignmentBlend,
        signals: snapshot.signals,
      }),
    });
    return { ok: res.ok, status: res.status };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

async function main() {
  const neonApi = require(path.join(root, "lib/shared/neon-memory.js"));
  const init = await neonApi.initializeSharedMemory();
  const enabled = Boolean(init?.enabled);

  const snapshot = await buildReconciliationSnapshot({
    cwd: root,
    neonApi: enabled ? neonApi : null,
    projectKey,
    authorityKey,
    checkpointKey,
    liveSyncPayload: null,
  });
  persistReconciliation(root, snapshot);

  const hook = await notifyHook(snapshot);
  const out = { ...snapshot, deployHook: hook };
  console.log(JSON.stringify(out, null, 2));

  const bad =
    !snapshot.ok ||
    (strictExit && snapshot.mismatches.some((m) => m.severity !== "low"));
  process.exit(bad ? 1 : 0);
}

main().catch((err) => {
  console.error("[bossmind-reconciliation-engine]", err);
  process.exit(1);
});
