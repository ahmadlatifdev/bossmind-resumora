/**
 * Auto-recovery state machine for Resumora.
 * Polls local Hermes HITL/MCP every 10s and syncs catalog status via existing PATCH API.
 * No new dependencies — uses global fetch + setInterval only.
 */

import { loadConfig } from '../config.js';

const PROJECT_ID = 'resumora';
const MAX_RETRIES = 3;
const UNREACHABLE_ALERT_MS = 60_000;

type RecoveryStatus = 'active' | 'offline';

async function ping(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(4_000),
    });
    return res.ok;
  } catch (err) {
    console.warn(`[auto-recovery] ping failed ${url}:`, err instanceof Error ? err.message : err);
    return false;
  }
}

async function probeLocalQueue(): Promise<{ ok: boolean; hitl: boolean; mcp: boolean }> {
  const cfg = loadConfig();
  const hitlUrl = `http://127.0.0.1:${cfg.HITL_PORT}/api/health`;
  const mcpUrl = `http://127.0.0.1:${cfg.MCP_PORT}/health`;
  const [hitl, mcp] = await Promise.all([ping(hitlUrl), ping(mcpUrl)]);
  const ok = hitl || mcp;
  console.log(
    `[auto-recovery] health probe hitl=${hitl} mcp=${mcp} → ${ok ? 'HEALTHY' : 'UNHEALTHY'}`
  );
  return { ok, hitl, mcp };
}

async function pushProjectStatus(status: RecoveryStatus, attempt: number): Promise<boolean> {
  const cfg = loadConfig();
  const password = cfg.ADMIN_REFUND_PASSWORD || cfg.VITE_ADMIN_PASSWORD;
  if (!password) {
    console.error(
      '[auto-recovery] ADMIN_REFUND_PASSWORD (or VITE_ADMIN_PASSWORD) missing — cannot sync status'
    );
    return false;
  }

  const base = cfg.RESUMORA_API_BASE.replace(/\/$/, '');
  const url = `${base}/api/projects/${PROJECT_ID}/status`;
  try {
    console.log(`[auto-recovery] PATCH ${url} status=${status} attempt=${attempt}/${MAX_RETRIES}`);
    const res = await fetch(url, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-password': password,
        Authorization: `Bearer ${password}`,
      },
      body: JSON.stringify({
        projectId: PROJECT_ID,
        status,
        source: 'auto-recovery',
      }),
      signal: AbortSignal.timeout(8_000),
    });
    const body = (await res.json().catch(() => ({}))) as { error?: string; status?: string };
    if (!res.ok) {
      console.error(
        `[auto-recovery] status sync failed HTTP ${res.status}:`,
        body.error || res.statusText
      );
      return false;
    }
    console.log(`[auto-recovery] status sync OK → ${body.status || status}`);
    return true;
  } catch (err) {
    console.error('[auto-recovery] status sync error:', err instanceof Error ? err.message : err);
    return false;
  }
}

async function pushWithRetries(status: RecoveryStatus): Promise<boolean> {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const ok = await pushProjectStatus(status, attempt);
    if (ok) return true;
    if (attempt < MAX_RETRIES) {
      const delayMs = 500 * attempt;
      console.warn(`[auto-recovery] retrying in ${delayMs}ms…`);
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  console.error(`[auto-recovery] gave up after ${MAX_RETRIES} attempts setting status=${status}`);
  return false;
}

/** High-priority alert when queue stays unreachable > 60s (console + optional webhook). */
async function fireUnreachableAlert(unreachableMs: number): Promise<void> {
  const seconds = Math.round(unreachableMs / 1000);
  console.error(
    `[auto-recovery][HIGH PRIORITY] Hermes queue unreachable for ${seconds}s ` +
      `(threshold 60s). Auto-recovery cannot keep Resumora ACTIVE until HITL/MCP returns.`
  );

  const webhook =
    process.env.ALERT_WEBHOOK_URL ||
    process.env.HERMES_ALERT_WEBHOOK ||
    process.env.BOSSMIND_ALERT_WEBHOOK ||
    '';
  if (!webhook) {
    console.warn(
      '[auto-recovery][HIGH PRIORITY] No ALERT_WEBHOOK_URL configured — console alert only'
    );
    return;
  }
  try {
    const res = await fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        severity: 'high',
        source: 'hermes-idea-queue-auto-recovery',
        projectId: PROJECT_ID,
        message: `Hermes queue unreachable for ${seconds}s`,
        at: new Date().toISOString(),
      }),
      signal: AbortSignal.timeout(5_000),
    });
    console.log(`[auto-recovery] alert webhook status=${res.status}`);
  } catch (err) {
    console.error(
      '[auto-recovery] alert webhook failed:',
      err instanceof Error ? err.message : err
    );
  }
}

let lastApplied: RecoveryStatus | null = null;
let tickBusy = false;
let unreachableSince: number | null = null;
let unreachableAlertSent = false;

export async function runRecoveryTick(): Promise<void> {
  if (tickBusy) {
    console.log('[auto-recovery] tick skipped (previous still running)');
    return;
  }
  tickBusy = true;
  try {
    const probe = await probeLocalQueue();
    const next: RecoveryStatus = probe.ok ? 'active' : 'offline';

    if (!probe.ok) {
      if (unreachableSince == null) unreachableSince = Date.now();
      const elapsed = Date.now() - unreachableSince;
      if (elapsed >= UNREACHABLE_ALERT_MS && !unreachableAlertSent) {
        await fireUnreachableAlert(elapsed);
        unreachableAlertSent = true;
      }
    } else {
      if (unreachableSince != null) {
        console.log(
          `[auto-recovery] queue reachable again after ${Math.round((Date.now() - unreachableSince) / 1000)}s`
        );
      }
      unreachableSince = null;
      unreachableAlertSent = false;
    }

    if (next === lastApplied) {
      console.log(`[auto-recovery] no change (still ${next})`);
      return;
    }
    console.log(`[auto-recovery] state transition ${lastApplied ?? 'unknown'} → ${next}`);
    const synced = await pushWithRetries(next);
    if (synced) {
      lastApplied = next;
      console.log(
        `[auto-recovery] applied ${next.toUpperCase()} for ${PROJECT_ID} (never leave stuck PAUSED)`
      );
    }
  } finally {
    tickBusy = false;
  }
}

/** Start 10s self-healing monitor. */
export function startAutoRecoveryMonitor(): NodeJS.Timeout {
  const cfg = loadConfig();
  console.log(
    `[auto-recovery] monitor started interval=${cfg.AUTO_RECOVERY_INTERVAL_MS}ms ` +
      `hitl=:${cfg.HITL_PORT} mcp=:${cfg.MCP_PORT} api=${cfg.RESUMORA_API_BASE} ` +
      `unreachableAlert=${UNREACHABLE_ALERT_MS}ms`
  );
  void runRecoveryTick();
  return setInterval(() => {
    void runRecoveryTick();
  }, cfg.AUTO_RECOVERY_INTERVAL_MS);
}
