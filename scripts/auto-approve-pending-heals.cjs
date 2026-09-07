#!/usr/bin/env node
/**
 * One-shot: clear up to 25 pending System Health approvals via production API.
 * Requires ADMIN_REFUND_PASSWORD in env. Auto-ACK only succeeds when Functions
 * have SELF_HEAL_ALLOW_GCLOUD or SELF_HEAL_ALLOW_AUTO_ACK=true.
 *
 *   node scripts/auto-approve-pending-heals.cjs
 */
'use strict';

const base = String(process.env.RESUMORA_API_BASE || 'https://resumora.net').replace(/\/$/, '');
const password = String(process.env.ADMIN_REFUND_PASSWORD || process.env.VITE_ADMIN_PASSWORD || '').trim();

async function main() {
  if (!password) {
    console.error('Set ADMIN_REFUND_PASSWORD to clear pending heal approvals.');
    process.exit(2);
  }

  // Prefer bulk endpoint (requires deployed autoAckSystemHeal + zero-touch env)
  const bulkRes = await fetch(`${base}/api/admin/system-health/auto-ack`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Admin-Password': password,
    },
    body: JSON.stringify({ limit: 25, note: 'one_shot_clear' }),
  });
  const bulkCt = String(bulkRes.headers.get('content-type') || '');
  const bulk = bulkCt.includes('application/json') ? await bulkRes.json().catch(() => ({})) : {};
  if (bulkRes.ok && bulk && bulk.ok === true && typeof bulk.count === 'number') {
    console.log(
      JSON.stringify(
        {
          ok: true,
          via: 'auto-ack',
          autoAckEnabled: bulk.autoAckEnabled,
          count: bulk.count,
          skipped: bulk.skipped,
          reason: bulk.reason || null,
        },
        null,
        2
      )
    );
    process.exit(bulk.skipped ? 3 : 0);
  }

  // Fallback: list health snapshot and decide one-by-one (works before auto-ack deploy)
  const healthRes = await fetch(`${base}/api/admin/system-health`, {
    headers: { 'X-Admin-Password': password },
  });
  const healthJson = await healthRes.json().catch(() => ({}));
  if (!healthRes.ok) {
    console.error('Health load failed:', healthJson.error || healthRes.status);
    process.exit(1);
  }
  const pending = Array.isArray(healthJson.pendingApprovals) ? healthJson.pendingApprovals : [];
  const approved = [];
  const errors = [];
  for (const row of pending.slice(0, 25)) {
    const id = String(row.id || '');
    if (!id) continue;
    const res = await fetch(`${base}/api/admin/system-health/decide`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Admin-Password': password,
      },
      body: JSON.stringify({ approvalId: id, decision: 'approve', note: 'one_shot_clear' }),
    });
    if (res.ok) approved.push(id);
    else {
      const errBody = await res.json().catch(() => ({}));
      errors.push({ id, error: errBody.error || res.status });
    }
  }
  console.log(
    JSON.stringify(
      {
        ok: true,
        via: 'decide_loop',
        pendingSeen: pending.length,
        count: approved.length,
        errors: errors.length,
      },
      null,
      2
    )
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err && err.message ? err.message : err);
  process.exit(1);
});
