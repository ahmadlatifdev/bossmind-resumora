/**
 * MAPE-K Self-Healing for resumora.net
 * Monitor → Analyze → Plan → Execute → Knowledge (+ Guardian + HITL)
 *
 * Safe auto-remediation only. Critical actions (secrets, migrations, restarts,
 * CDN purge / env rollback) create approval tickets — never applied silently.
 * Never logs full sk_live_ / pk_live_ / whsec_ / price_ values.
 */
const crypto = require('crypto');
const { FieldValue, Timestamp } = require('firebase-admin/firestore');

const HEALTH_COL = 'system_health';
const HEALTH_DOC = 'current';
const INCIDENTS_COL = 'system_incidents';
const REMEDIATIONS_COL = 'system_remediations';
const APPROVALS_COL = 'system_heal_approvals';
const NOTIFY_COL = 'notification_history';
const CIRCUIT_COL = 'system_circuit_breakers';
const FIRST_FIX_COL = 'system_first_time_fixes';
/** Wider window reduces flap when the same env-drift finding repeats every scheduler tick. */
const CIRCUIT_WINDOW_MS = Number(process.env.SELF_HEAL_CIRCUIT_WINDOW_MS || 15 * 60 * 1000);
const CIRCUIT_TRIP_COUNT = Number(process.env.SELF_HEAL_CIRCUIT_TRIP_COUNT || 3);
/** After OPEN, wait this long before half-open probe (prevents stuck open forever / re-notify storms). */
const CIRCUIT_HALF_OPEN_MS = Number(process.env.SELF_HEAL_CIRCUIT_HALF_OPEN_MS || 30 * 60 * 1000);
/** Cap safe auto-remediation attempts per error type per rolling day. */
const MAX_REMEDIATION_ATTEMPTS = Number(process.env.SELF_HEAL_MAX_REMEDIATION_ATTEMPTS || 2);
const REMEDIATION_ATTEMPT_WINDOW_MS = Number(
  process.env.SELF_HEAL_REMEDIATION_ATTEMPT_WINDOW_MS || 24 * 60 * 60 * 1000
);
const ENV_FINGERPRINT_DOC = 'env_drift_fingerprint';
const FORBIDDEN_SECRET_KEYS = Object.freeze([
  'STRIPE_API_KEY',
  'STRIPE_SECRET_KEY',
  'SECRET_STRIPE',
  'STRIPE_WEBHOOK_SECRET',
  'STRIPE_WEBHOOK_SECRET_LIVE',
  'BILIBILI_SESSDATA',
  'BILIBILI_BILI_JCT',
  'BILIBILI_DEDE_USER_ID',
  'RESEND_API_KEY',
  'EMAIL_API_KEY',
]);
const LOCAL_SECRET_FILES = Object.freeze(['.env.local', 'bilibili_secrets.env']);
const SITE_ORIGIN = 'https://resumora.net';
const DASHBOARD_URL = 'https://resumora.net/admin/system-health';
const PROBE_PATHS = ['/', '/pricing', '/login'];
const HEALTH_ALERT_THRESHOLD = Number(process.env.SELF_HEAL_ALERT_THRESHOLD || 70);
const HEALTH_ALERT_COOLDOWN_MS = Number(
  process.env.SELF_HEAL_ALERT_COOLDOWN_MS || 6 * 60 * 60 * 1000
);

const RISK = Object.freeze({
  SAFE: 'safe',
  CRITICAL: 'critical',
});

function timingSafeEqualString(a, b) {
  const left = Buffer.from(String(a || ''), 'utf8');
  const right = Buffer.from(String(b || ''), 'utf8');
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function assertAdminPassword(req, expected) {
  const provided =
    req.get('x-admin-password') ||
    req.get('X-Admin-Password') ||
    (req.body && req.body.adminPassword) ||
    '';
  if (!expected || !timingSafeEqualString(provided, expected)) {
    const err = new Error('Unauthorized');
    err.statusCode = 401;
    throw err;
  }
}

function structuredLog(level, scope, payload) {
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    scope: `selfHeal.${scope}`,
    ...(payload || {}),
  });
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

/** Prefix-only secret diagnostics — never full values. */
function secretShape(value, expectedPrefixes) {
  const v = String(value || '').trim();
  if (!v) return { present: false, ok: false, kind: 'missing', prefix: '(empty)' };
  const prefix = `${v.slice(0, Math.min(10, v.length))}...`;
  const matched = (expectedPrefixes || []).some((p) => v.startsWith(p));
  return {
    present: true,
    ok: matched,
    kind: matched ? 'expected_prefix' : 'unexpected_format',
    prefix,
    length: v.length,
  };
}

function priceShape(value) {
  const v = String(value || '').trim();
  if (!v) return { present: false, ok: false, prefix: '(empty)' };
  const ok = /^price_/.test(v);
  return { present: true, ok, prefix: ok ? 'price_…' : 'non_price' };
}

/**
 * Presence/shape fingerprint only — never includes secret values.
 * Used for preemptive drift detection without re-tripping every cycle.
 */
function envDriftFingerprint(env) {
  const e = env || {};
  return JSON.stringify({
    stripe: e.stripeSecret
      ? { present: e.stripeSecret.present, ok: e.stripeSecret.ok, kind: e.stripeSecret.kind }
      : null,
    webhook: e.webhookSecret
      ? { present: e.webhookSecret.present, ok: e.webhookSecret.ok, kind: e.webhookSecret.kind }
      : null,
    publishable: e.publishableKey
      ? { present: e.publishableKey.present, ok: e.publishableKey.ok, kind: e.publishableKey.kind }
      : null,
    prices: Object.fromEntries(
      Object.entries(e.prices || {}).map(([k, v]) => [k, { present: v.present, ok: v.ok }])
    ),
    resend: e.resend ? { present: e.resend.present, ok: e.resend.ok } : null,
    adminPasswordConfigured: Boolean(e.adminPasswordConfigured),
  });
}

async function loadEnvFingerprintState(db) {
  try {
    const snap = await db.collection(HEALTH_COL).doc(ENV_FINGERPRINT_DOC).get();
    if (!snap.exists) return { fingerprint: null, stableCycles: 0 };
    const data = snap.data() || {};
    return {
      fingerprint: data.fingerprint || null,
      stableCycles: Number(data.stableCycles || 0),
      lastChangedAt: data.lastChangedAt || null,
    };
  } catch (_) {
    return { fingerprint: null, stableCycles: 0 };
  }
}

async function saveEnvFingerprintState(db, fingerprint, previous) {
  const same = previous && previous.fingerprint === fingerprint;
  await db
    .collection(HEALTH_COL)
    .doc(ENV_FINGERPRINT_DOC)
    .set(
      {
        fingerprint,
        stableCycles: same ? Number(previous.stableCycles || 0) + 1 : 0,
        lastChangedAt: same
          ? previous.lastChangedAt || FieldValue.serverTimestamp()
          : FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        note: 'Shape-only env inventory; no secret values stored.',
      },
      { merge: true }
    );
  return {
    fingerprint,
    changed: !same,
    stableCycles: same ? Number(previous.stableCycles || 0) + 1 : 0,
  };
}

function readEnvInventory() {
  const stripeSecret =
    process.env.STRIPE_API_KEY || process.env.STRIPE_SECRET_KEY || process.env.SECRET_STRIPE || '';
  const webhook = process.env.STRIPE_WEBHOOK_SECRET || process.env.STRIPE_WEBHOOK_SECRET_LIVE || '';
  const publishable =
    process.env.STRIPE_PUBLISHABLE_KEY ||
    process.env.VITE_STRIPE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ||
    '';

  const prices = {
    basic: process.env.STRIPE_PRICE_BASIC || process.env.VITE_STRIPE_PRICE_BASIC || '',
    balanced: process.env.STRIPE_PRICE_BALANCED || process.env.VITE_STRIPE_PRICE_BALANCED || '',
    professional:
      process.env.STRIPE_PRICE_PROFESSIONAL_TIER ||
      process.env.VITE_STRIPE_PRICE_PROFESSIONAL_TIER ||
      '',
    advanced: process.env.STRIPE_PRICE_ADVANCED || process.env.VITE_STRIPE_PRICE_ADVANCED || '',
  };

  return {
    stripeSecret: secretShape(stripeSecret, ['sk_live_', 'sk_test_']),
    webhookSecret: secretShape(webhook, ['whsec_']),
    publishableKey: secretShape(publishable, ['pk_live_', 'pk_test_']),
    prices: Object.fromEntries(Object.entries(prices).map(([k, v]) => [k, priceShape(v)])),
    resend: secretShape(process.env.RESEND_API_KEY || process.env.EMAIL_API_KEY || '', ['re_']),
    adminPasswordConfigured: Boolean(String(process.env.ADMIN_REFUND_PASSWORD || '').trim()),
    allowRestart: String(process.env.SELF_HEAL_ALLOW_RESTART || '').toLowerCase() === 'true',
    allowCdnPurge: String(process.env.SELF_HEAL_ALLOW_CDN_PURGE || '').toLowerCase() === 'true',
  };
}

async function probeUrl(url, { method = 'GET', timeoutMs = 12000 } = {}) {
  const started = Date.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method,
      redirect: 'follow',
      signal: ctrl.signal,
      headers: { 'User-Agent': 'Resumora-SelfHeal/1.0' },
    });
    const latencyMs = Date.now() - started;
    return {
      url,
      method,
      ok: res.status >= 200 && res.status < 500,
      healthy: res.status >= 200 && res.status < 400,
      status: res.status,
      latencyMs,
    };
  } catch (err) {
    return {
      url,
      method,
      ok: false,
      healthy: false,
      status: 0,
      latencyMs: Date.now() - started,
      error: String(err && err.message ? err.message : err).slice(0, 160),
    };
  } finally {
    clearTimeout(timer);
  }
}

async function monitorHosting() {
  const results = [];
  for (const path of PROBE_PATHS) {
    results.push(await probeUrl(`${SITE_ORIGIN}${path}`));
  }
  results.push(await probeUrl(`${SITE_ORIGIN}/api/create-checkout-session`, { method: 'OPTIONS' }));
  return results;
}

async function monitorIamProbes() {
  const urls = [
    `${SITE_ORIGIN}/api/create-checkout-session`,
    `${SITE_ORIGIN}/api/video/google-generate`,
  ];
  const results = [];
  for (const url of urls) {
    results.push(await probeUrl(url, { method: 'OPTIONS' }));
  }
  const blocked = results.filter((p) => p.status === 403 || p.status === 401);
  return {
    results,
    blocked: blocked.length > 0,
    blockedCount: blocked.length,
  };
}

async function monitorFirestore(db) {
  const started = Date.now();
  try {
    const ref = db.collection(HEALTH_COL).doc(HEALTH_DOC);
    await ref.set(
      {
        lastProbeAt: FieldValue.serverTimestamp(),
        knowledgeHeartbeat: true,
      },
      { merge: true }
    );
    const snap = await ref.get();
    return {
      ok: snap.exists,
      latencyMs: Date.now() - started,
    };
  } catch (err) {
    return {
      ok: false,
      latencyMs: Date.now() - started,
      error: String(err && err.message ? err.message : err).slice(0, 160),
    };
  }
}

async function monitorStripe(stripe) {
  if (!stripe) {
    return { ok: false, reason: 'stripe_client_missing' };
  }
  const started = Date.now();
  try {
    const list = await stripe.prices.list({ limit: 1, active: true });
    const first = list && list.data && list.data[0];
    return {
      ok: true,
      latencyMs: Date.now() - started,
      // Never log full price_ IDs
      samplePricePresent: Boolean(first && first.id && String(first.id).startsWith('price_')),
    };
  } catch (err) {
    return {
      ok: false,
      latencyMs: Date.now() - started,
      error: String(err && err.message ? err.message : err).slice(0, 160),
    };
  }
}

/** Analyze: score + RCA findings (keys for i18n on the dashboard). */
function analyze(observations) {
  const findings = [];
  let score = 100;
  const hosting = observations.hosting || [];
  const slow = hosting.filter((p) => p.latencyMs > 4000);
  const down = hosting.filter((p) => !p.healthy);

  for (const p of down) {
    findings.push({
      code: 'hosting_probe_failed',
      severity: 'high',
      detail: { path: p.url, status: p.status, error: p.error || null },
      rcaKey: 'heal.rca.hostingDown',
    });
    score -= 25;
  }
  for (const p of slow) {
    findings.push({
      code: 'hosting_high_latency',
      severity: 'medium',
      detail: { path: p.url, latencyMs: p.latencyMs },
      rcaKey: 'heal.rca.highLatency',
    });
    score -= 8;
  }

  const env = observations.env || {};
  if (!env.stripeSecret || !env.stripeSecret.ok) {
    findings.push({
      code: 'env_stripe_secret_drift',
      severity: 'critical',
      detail: { kind: env.stripeSecret && env.stripeSecret.kind },
      rcaKey: 'heal.rca.envStripeSecret',
      risk: RISK.CRITICAL,
    });
    score -= 30;
  }
  if (!env.webhookSecret || !env.webhookSecret.ok) {
    findings.push({
      code: 'env_webhook_drift',
      severity: 'critical',
      detail: { kind: env.webhookSecret && env.webhookSecret.kind },
      rcaKey: 'heal.rca.envWebhook',
      risk: RISK.CRITICAL,
    });
    score -= 20;
  }
  const priceFail = Object.entries(env.prices || {}).filter(([, v]) => !v.ok);
  if (priceFail.length) {
    findings.push({
      code: 'env_price_drift',
      severity: 'high',
      detail: { plans: priceFail.map(([k]) => k) },
      rcaKey: 'heal.rca.envPrices',
      risk: RISK.CRITICAL,
    });
    score -= 10 * priceFail.length;
  }

  if (observations.firestore && !observations.firestore.ok) {
    findings.push({
      code: 'firestore_unreachable',
      severity: 'critical',
      detail: { error: observations.firestore.error || null },
      rcaKey: 'heal.rca.firestore',
      risk: RISK.CRITICAL,
    });
    score -= 35;
  }

  if (observations.stripe && !observations.stripe.ok) {
    findings.push({
      code: 'stripe_api_unhealthy',
      severity: 'high',
      detail: { error: observations.stripe.error || observations.stripe.reason || null },
      rcaKey: 'heal.rca.stripeApi',
    });
    score -= 20;
  }

  if (observations.iam && observations.iam.blocked) {
    findings.push({
      code: 'iam_policy_block',
      severity: 'high',
      detail: { blockedCount: observations.iam.blockedCount },
      rcaKey: 'heal.rca.iamBlock',
      risk: RISK.CRITICAL,
    });
    score -= 15;
  }

  score = Math.max(0, Math.min(100, score));
  const status =
    score >= 90 ? 'healthy' : score >= 70 ? 'degraded' : score >= 40 ? 'impaired' : 'critical';

  return { score, status, findings };
}

function mapFindingToErrorType(code) {
  const table = {
    hosting_probe_failed: 'HOSTING_PROBE',
    hosting_high_latency: 'HOSTING_LATENCY',
    env_stripe_secret_drift: 'ENV_SECRET_DRIFT',
    env_webhook_drift: 'STRIPE_WEBHOOK_DRIFT',
    env_price_drift: 'ENV_PRICE_DRIFT',
    firestore_unreachable: 'FIRESTORE',
    stripe_api_unhealthy: 'STRIPE_API',
    iam_policy_block: 'IAM_POLICY_BLOCK',
  };
  return table[code] || String(code || 'UNKNOWN').toUpperCase();
}

function circuitDocId(errorType) {
  return String(errorType || 'UNKNOWN')
    .replace(/[^A-Z0-9_]/gi, '_')
    .slice(0, 80);
}

/**
 * Guardrail: refuse any auto-fix that would mutate secrets, local env files, or IAM.
 * Returns { ok, reason, requiresHuman }.
 */
function preDamageCheck(action, analysis) {
  const id = String(action && action.id ? action.id : '');
  const codes = new Set((analysis.findings || []).map((f) => f.code));

  if (LOCAL_SECRET_FILES.some((f) => id.includes(f) || String(action.reason || '').includes(f))) {
    return { ok: false, requiresHuman: true, reason: 'local_secret_file_guard' };
  }

  const secretFindings = ['env_stripe_secret_drift', 'env_webhook_drift', 'env_price_drift'];
  if (secretFindings.some((c) => codes.has(c))) {
    return { ok: false, requiresHuman: true, reason: 'secret_or_price_env_requires_human' };
  }

  if (codes.has('iam_policy_block')) {
    return { ok: false, requiresHuman: true, reason: 'iam_policy_requires_human' };
  }

  const envKeysTouched = String(action.reason || '') + String(id);
  if (FORBIDDEN_SECRET_KEYS.some((k) => envKeysTouched.includes(k))) {
    return { ok: false, requiresHuman: true, reason: 'forbidden_secret_key_name' };
  }

  const forbiddenIds = new Set([
    'env_rollback_proposal',
    'cloud_run_restart_proposal',
    'cdn_purge_proposal',
    'secret_rewrite',
    'gcloud_iam_bypass',
    'firebase_deploy',
  ]);
  if (forbiddenIds.has(id) || action.risk === RISK.CRITICAL) {
    return { ok: false, requiresHuman: true, reason: 'critical_or_forbidden_action' };
  }

  // SAFE allowlist only
  const allowed = new Set(['warmup_endpoints', 'record_only', 'first_time_warmup_verify']);
  if (!allowed.has(id)) {
    return { ok: false, requiresHuman: true, reason: 'action_not_in_safe_allowlist' };
  }

  return { ok: true, requiresHuman: false, reason: 'allowlisted_safe' };
}

async function recordErrorOccurrence(db, errorType, cycleId) {
  const id = circuitDocId(errorType);
  const ref = db.collection(CIRCUIT_COL).doc(id);
  const now = Date.now();
  const windowStart = now - CIRCUIT_WINDOW_MS;

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.exists ? snap.data() || {} : {};
    let open = data.state === 'open' || data.paused === true;

    // Half-open: after cool-down, allow one observation window instead of permanent flap/open.
    if (open) {
      let openedMs = 0;
      if (data.openedAt && typeof data.openedAt.toDate === 'function') {
        openedMs = data.openedAt.toDate().getTime();
      } else if (typeof data.openedAtMs === 'number') {
        openedMs = data.openedAtMs;
      }
      const age = openedMs ? now - openedMs : 0;
      if (age >= CIRCUIT_HALF_OPEN_MS) {
        tx.set(
          ref,
          {
            errorType,
            state: 'half_open',
            paused: false,
            hits: [now],
            countInWindow: 1,
            windowMs: CIRCUIT_WINDOW_MS,
            tripCount: CIRCUIT_TRIP_COUNT,
            halfOpenAt: FieldValue.serverTimestamp(),
            lastCycleId: cycleId,
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
        return {
          errorType,
          state: 'half_open',
          count: 1,
          tripped: false,
          alreadyOpen: false,
          halfOpen: true,
        };
      }
      return {
        errorType,
        state: 'open',
        count: Number(data.countInWindow || 0),
        tripped: true,
        alreadyOpen: true,
        remediationAttempts: Number(data.remediationAttempts || 0),
      };
    }

    const hits = Array.isArray(data.hits) ? data.hits.filter((h) => Number(h) >= windowStart) : [];
    hits.push(now);
    const count = hits.length;
    const shouldTrip = count >= CIRCUIT_TRIP_COUNT;
    const next = {
      errorType,
      hits,
      countInWindow: count,
      windowMs: CIRCUIT_WINDOW_MS,
      tripCount: CIRCUIT_TRIP_COUNT,
      halfOpenMs: CIRCUIT_HALF_OPEN_MS,
      maxRemediationAttempts: MAX_REMEDIATION_ATTEMPTS,
      remediationAttempts: Number(data.remediationAttempts || 0),
      state: shouldTrip ? 'open' : data.state === 'half_open' && !shouldTrip ? 'closed' : 'closed',
      paused: shouldTrip,
      requiresHumanReview: shouldTrip,
      lastCycleId: cycleId,
      lastHitAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };
    if (shouldTrip) {
      next.openedAt = FieldValue.serverTimestamp();
      next.openedAtMs = now;
      next.openReason = `${count}_hits_in_${CIRCUIT_WINDOW_MS}ms`;
    }
    tx.set(ref, next, { merge: true });
    return {
      errorType,
      state: next.state,
      count,
      tripped: shouldTrip,
      alreadyOpen: false,
      remediationAttempts: next.remediationAttempts,
    };
  });
}

async function canAttemptRemediation(db, errorType) {
  const id = circuitDocId(errorType);
  try {
    const snap = await db.collection(CIRCUIT_COL).doc(id).get();
    if (!snap.exists) return { ok: true, attempts: 0 };
    const data = snap.data() || {};
    const attempts = Number(data.remediationAttempts || 0);
    let lastMs = 0;
    if (data.lastRemediationAt && typeof data.lastRemediationAt.toDate === 'function') {
      lastMs = data.lastRemediationAt.toDate().getTime();
    }
    if (lastMs && Date.now() - lastMs > REMEDIATION_ATTEMPT_WINDOW_MS) {
      return { ok: true, attempts: 0, resetWindow: true };
    }
    if (attempts >= MAX_REMEDIATION_ATTEMPTS) {
      return { ok: false, attempts, reason: 'remediation_attempts_exhausted' };
    }
    return { ok: true, attempts };
  } catch (_) {
    return { ok: true, attempts: 0 };
  }
}

async function bumpRemediationAttempts(db, errorType, cycleId) {
  const id = circuitDocId(errorType);
  const ref = db.collection(CIRCUIT_COL).doc(id);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.exists ? snap.data() || {} : {};
    let attempts = Number(data.remediationAttempts || 0);
    let lastMs = 0;
    if (data.lastRemediationAt && typeof data.lastRemediationAt.toDate === 'function') {
      lastMs = data.lastRemediationAt.toDate().getTime();
    }
    if (lastMs && Date.now() - lastMs > REMEDIATION_ATTEMPT_WINDOW_MS) {
      attempts = 0;
    }
    tx.set(
      ref,
      {
        errorType,
        remediationAttempts: attempts + 1,
        lastRemediationAt: FieldValue.serverTimestamp(),
        lastRemediationCycleId: cycleId,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  });
}

async function findPendingApproval(db, actionId) {
  try {
    const q = await db
      .collection(APPROVALS_COL)
      .where('actionId', '==', String(actionId || ''))
      .where('status', '==', 'pending_approval')
      .limit(1)
      .get();
    if (!q.empty) {
      const d = q.docs[0];
      return { id: d.id, ...(d.data() || {}) };
    }
  } catch (_) {
    /* composite index may be missing — fall through */
  }
  return null;
}

async function listOpenCircuits(db) {
  try {
    const q = await db.collection(CIRCUIT_COL).where('state', '==', 'open').limit(40).get();
    return q.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }));
  } catch (_) {
    const q = await db.collection(CIRCUIT_COL).limit(40).get();
    return q.docs
      .map((d) => ({ id: d.id, ...(d.data() || {}) }))
      .filter((d) => d.state === 'open' || d.paused);
  }
}

async function resetCircuitsIfHealthy(db, analysis) {
  if (!analysis || analysis.score < 100 || (analysis.findings || []).length) return { reset: [] };
  const open = await listOpenCircuits(db);
  const reset = [];
  for (const c of open) {
    await db.collection(CIRCUIT_COL).doc(c.id).set(
      {
        state: 'closed',
        paused: false,
        requiresHumanReview: false,
        hits: [],
        countInWindow: 0,
        closedAt: FieldValue.serverTimestamp(),
        closedReason: 'health_score_100',
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    reset.push(c.errorType || c.id);
  }
  return { reset };
}

async function freezeCircuit(db, errorType, reason, cycleId) {
  const id = circuitDocId(errorType);
  await db
    .collection(CIRCUIT_COL)
    .doc(id)
    .set(
      {
        errorType,
        state: 'open',
        paused: true,
        requiresHumanReview: true,
        lastCycleId: cycleId,
        freezeReason: String(reason || 'verification_failed').slice(0, 200),
        openedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
}

/**
 * First-time auto-fix: warmup + HTTP verify only.
 * Does not run gcloud/firebase deploy (those mutate IAM/secrets and require HITL).
 */
async function autoRemediateFirstTime(db, { errorType, cycleId, analysis }) {
  const firstRef = db.collection(FIRST_FIX_COL).doc(circuitDocId(errorType));
  const firstSnap = await firstRef.get();
  const alreadyTried = firstSnap.exists && firstSnap.data()?.status === 'remediated';

  const guard = preDamageCheck(
    { id: 'first_time_warmup_verify', risk: RISK.SAFE, reason: 'first_time_auto_fix' },
    analysis
  );
  if (!guard.ok) {
    return {
      skipped: true,
      reason: guard.reason,
      requiresHuman: true,
      errorType,
    };
  }

  if (alreadyTried) {
    return { skipped: true, reason: 'already_first_timed', errorType };
  }

  const attemptGate = await canAttemptRemediation(db, errorType);
  if (!attemptGate.ok) {
    return {
      skipped: true,
      reason: attemptGate.reason || 'remediation_attempts_exhausted',
      requiresHuman: true,
      errorType,
      remediationAttempts: attemptGate.attempts,
    };
  }

  await bumpRemediationAttempts(db, errorType, cycleId);

  const before = await monitorHosting();
  const warmup = await executeWarmup();
  const after = await monitorHosting();
  const verified = after.every((p) => p.healthy);

  const record = {
    errorType,
    cycleId,
    status: verified ? 'remediated' : 'verification_failed',
    warmupOk: Boolean(warmup.ok),
    verified,
    beforeStatuses: before.map((p) => p.status),
    afterStatuses: after.map((p) => p.status),
    note: 'Safe first-time fix is HTTP warmup only. gcloud IAM / firebase deploy remain HITL.',
    updatedAt: FieldValue.serverTimestamp(),
  };
  await firstRef.set(record, { merge: true });

  await writeRemediation(db, {
    cycleId,
    actionId: 'first_time_warmup_verify',
    errorType,
    risk: RISK.SAFE,
    status: verified ? 'applied' : 'verification_failed',
    result: { warmup, verified },
    titleKey: 'heal.action.firstTime',
  });

  if (!verified) {
    await freezeCircuit(db, errorType, 'first_time_verify_failed', cycleId);
    await createApproval(
      db,
      {
        id: 'auto_rollback_proposal',
        titleKey: 'heal.action.rollback',
        reason: `First-time auto-fix verification failed for ${errorType} — freeze + human rollback`,
      },
      analysis,
      cycleId
    );
  }

  return { skipped: false, verified, errorType, warmup };
}

function planRemediations(analysis) {
  const actions = [];
  const codes = new Set((analysis.findings || []).map((f) => f.code));

  if (codes.has('hosting_probe_failed') || codes.has('hosting_high_latency')) {
    actions.push({
      id: 'warmup_endpoints',
      risk: RISK.SAFE,
      titleKey: 'heal.action.warmup',
      reason: 'Reflexion: retry cold paths after failed/slow probes',
    });
  }

  if (codes.has('hosting_probe_failed')) {
    actions.push({
      id: 'cdn_purge_proposal',
      risk: RISK.CRITICAL,
      titleKey: 'heal.action.cdnPurge',
      reason: 'Hosting may be serving stale HTML — requires human-approved purge/redeploy',
    });
  }

  if (codes.has('stripe_api_unhealthy') || codes.has('env_stripe_secret_drift')) {
    actions.push({
      id: 'cloud_run_restart_proposal',
      risk: RISK.CRITICAL,
      titleKey: 'heal.action.restart',
      reason: 'Stuck Cloud Run / bad secret injection — restart needs approval',
    });
  }

  if (
    codes.has('env_stripe_secret_drift') ||
    codes.has('env_webhook_drift') ||
    codes.has('env_price_drift')
  ) {
    actions.push({
      id: 'env_rollback_proposal',
      risk: RISK.CRITICAL,
      titleKey: 'heal.action.envRollback',
      reason: 'Env drift detected — Git rollback / secret rotation requires approval',
    });
  }

  if (!actions.length && analysis.score < 100) {
    actions.push({
      id: 'record_only',
      risk: RISK.SAFE,
      titleKey: 'heal.action.record',
      reason: 'No safe auto-fix; knowledge base updated',
    });
  }

  return actions;
}

async function sendAdminNotify({ subject, text, html }) {
  const apiKey = String(process.env.RESEND_API_KEY || process.env.EMAIL_API_KEY || '').trim();
  const to =
    String(
      process.env.SELF_HEAL_ADMIN_EMAIL || process.env.ADMIN_NOTIFY_EMAIL || 'info@resumora.net'
    ).trim() || 'info@resumora.net';
  const from =
    String(process.env.SELF_HEAL_EMAIL_FROM || process.env.REFUND_EMAIL_FROM || '').trim() ||
    'Resumora Self-Heal <onboarding@resend.dev>';

  const slackUrl = String(
    process.env.SELF_HEAL_SLACK_WEBHOOK || process.env.SLACK_WEBHOOK_URL || ''
  ).trim();
  if (slackUrl) {
    try {
      await fetch(slackUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: `${subject}\n${text}` }),
      });
    } catch (err) {
      structuredLog('warn', 'slack', { error: String(err.message || err).slice(0, 120) });
    }
  }

  if (!apiKey) {
    structuredLog('warn', 'notify', { skipped: true, hasKey: false, hasTo: Boolean(to) });
    return { skipped: true };
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from, to: [to], subject, text, html: html || undefined }),
  });
  if (!res.ok) {
    structuredLog('error', 'notify', { status: res.status });
    return { ok: false, status: res.status };
  }
  return { ok: true };
}

async function notificationCooldownAllows(db, key, cooldownMs) {
  const snap = await db.collection(NOTIFY_COL).doc(key).get();
  if (!snap.exists) return true;
  const last = snap.data()?.lastSentAt;
  if (!last || typeof last.toDate !== 'function') return true;
  return Date.now() - last.toDate().getTime() >= cooldownMs;
}

async function recordNotification(db, key, payload) {
  await db
    .collection(NOTIFY_COL)
    .doc(key)
    .set(
      {
        key,
        ...payload,
        lastSentAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
}

/**
 * Real-time alert when score &lt; threshold or Guardian fails after remediation.
 * Deduped via notification_history.
 */
async function maybeSendHealthAlert(db, { cycleId, analysis, guardian, incidentId }) {
  const threshold = Number.isFinite(HEALTH_ALERT_THRESHOLD) ? HEALTH_ALERT_THRESHOLD : 70;
  const scoreLow = analysis.score < threshold;
  const guardianFail = guardian && guardian.passed === false;
  if (!scoreLow && !guardianFail) {
    if (analysis.score >= threshold) {
      await db.collection(NOTIFY_COL).doc('health_score_low').set(
        {
          key: 'health_score_low',
          resolved: true,
          resolvedAt: FieldValue.serverTimestamp(),
          lastScore: analysis.score,
        },
        { merge: true }
      );
    }
    return { sent: false };
  }

  const key = scoreLow ? 'health_score_low' : 'health_guardian_fail';
  if (!(await notificationCooldownAllows(db, key, HEALTH_ALERT_COOLDOWN_MS))) {
    structuredLog('info', 'alert.suppressed', { key, score: analysis.score });
    return { sent: false, suppressed: true };
  }

  const when = new Date().toISOString();
  const findings = (analysis.findings || [])
    .slice(0, 8)
    .map((f) => `- ${f.code} (${f.severity || 'info'})`)
    .join('\n');
  const subject = `[Resumora] System health ${analysis.status} — score ${analysis.score}`;
  const text = [
    'System health alert (MAPE-K self-heal).',
    '',
    `Time: ${when}`,
    `Cycle: ${cycleId}`,
    `Score: ${analysis.score} / threshold ${threshold}`,
    `Status: ${analysis.status}`,
    `Guardian passed: ${guardian && guardian.passed ? 'yes' : 'no'}`,
    `Incident: ${incidentId || '—'}`,
    '',
    'Findings:',
    findings || '- (none)',
    '',
    `Dashboard: ${DASHBOARD_URL}`,
    '',
    'FR: Alerte santé système — ouvrez le tableau de bord.',
    'ES: Alerta de salud del sistema — abra el panel.',
  ].join('\n');

  await sendAdminNotify({ subject, text });
  await recordNotification(db, key, {
    type: key,
    subject,
    score: analysis.score,
    status: analysis.status,
    cycleId,
    incidentId: incidentId || null,
    resolved: false,
    dashboardUrl: DASHBOARD_URL,
  });
  // Also append an auto-id history row for audit trail
  await db.collection(NOTIFY_COL).add({
    key,
    type: key,
    subject,
    score: analysis.score,
    cycleId,
    createdAt: FieldValue.serverTimestamp(),
  });

  structuredLog('warn', 'alert.sent', { key, score: analysis.score });
  return { sent: true, key };
}

async function createApproval(db, action, analysis, cycleId) {
  const existing = await findPendingApproval(db, action.id);
  if (existing) {
    structuredLog('info', 'approval.deduped', {
      actionId: action.id,
      existingId: existing.id,
      cycleId,
    });
    return { id: existing.id, ...existing, deduped: true };
  }

  const ref = db.collection(APPROVALS_COL).doc();
  const doc = {
    id: ref.id,
    cycleId,
    actionId: action.id,
    titleKey: action.titleKey,
    reason: action.reason,
    risk: RISK.CRITICAL,
    status: 'pending_approval',
    analysisScore: analysis.score,
    analysisStatus: analysis.status,
    findingCodes: (analysis.findings || []).map((f) => f.code),
    createdAt: FieldValue.serverTimestamp(),
    localeMessages: {
      en: `Approval required: ${action.id} — ${action.reason}`,
      fr: `Approbation requise: ${action.id} — ${action.reason}`,
      es: `Aprobación requerida: ${action.id} — ${action.reason}`,
    },
  };
  await ref.set(doc);
  await sendAdminNotify({
    subject: `[Resumora Self-Heal] Approval required — ${action.id}`,
    text: [
      'A critical remediation was planned but NOT applied.',
      '',
      `Approval ID: ${ref.id}`,
      `Action: ${action.id}`,
      `Reason: ${action.reason}`,
      `Health score: ${analysis.score} (${analysis.status})`,
      '',
      `Dashboard: ${DASHBOARD_URL}`,
      'Approve via /admin/system-health or POST /api/admin/system-health/decide',
      'FR: Une correction critique nécessite votre approbation.',
      'ES: Una corrección crítica requiere su aprobación.',
    ].join('\n'),
  });
  return { id: ref.id, ...doc, createdAt: new Date().toISOString(), deduped: false };
}

async function executeWarmup() {
  const results = [];
  for (let i = 0; i < 2; i += 1) {
    for (const path of PROBE_PATHS) {
      results.push(await probeUrl(`${SITE_ORIGIN}${path}`));
    }
    results.push(
      await probeUrl(`${SITE_ORIGIN}/api/create-checkout-session`, { method: 'OPTIONS' })
    );
  }
  const recovered = results.filter((r) => r.healthy).length;
  return {
    ok: recovered >= PROBE_PATHS.length,
    recovered,
    probed: results.length,
  };
}

/**
 * Guardian: re-verify hosting + Stripe + env shapes after remediation.
 * Checkout session IDs must remain live-capable (cs_live_ prefix when live keys).
 */
async function runGuardian(db, stripe) {
  const hosting = await monitorHosting();
  const firestore = await monitorFirestore(db);
  const env = readEnvInventory();
  const stripeHealth = await monitorStripe(stripe);

  const liveMode =
    env.stripeSecret.ok && String(env.stripeSecret.prefix || '').startsWith('sk_live_');

  const checks = {
    hostingOk: hosting.every((p) => p.healthy),
    firestoreOk: firestore.ok,
    stripeOk: stripeHealth.ok,
    envStripeOk: env.stripeSecret.ok,
    envWebhookOk: env.webhookSecret.ok,
    expectedCheckoutPrefix: liveMode ? 'cs_live_' : 'cs_test_',
    note: 'Guardian does not create Checkout Sessions; verifies API + env shapes only.',
  };

  const passed =
    checks.hostingOk &&
    checks.firestoreOk &&
    checks.stripeOk &&
    checks.envStripeOk &&
    checks.envWebhookOk;

  return { passed, checks, hosting, firestore, stripe: stripeHealth, env };
}

async function writeRemediation(db, entry) {
  const ref = db.collection(REMEDIATIONS_COL).doc();
  await ref.set({
    ...entry,
    id: ref.id,
    createdAt: FieldValue.serverTimestamp(),
  });
  return ref.id;
}

async function writeIncident(db, analysis, cycleId, extra = {}) {
  if (!analysis.findings || !analysis.findings.length) return null;
  const ref = db.collection(INCIDENTS_COL).doc();
  await ref.set({
    id: ref.id,
    cycleId,
    score: analysis.score,
    status: analysis.status,
    findings: analysis.findings,
    errorTypes: (analysis.findings || []).map((f) => mapFindingToErrorType(f.code)),
    requiresHumanReview: Boolean(extra.requiresHumanReview),
    circuitTripped: extra.circuitTripped || [],
    createdAt: FieldValue.serverTimestamp(),
  });
  return ref.id;
}

/**
 * Full MAPE-K cycle with Reflexion: if Guardian fails after safe fix, open HITL rollback ticket.
 */
async function runSelfHealCycle(db, stripe, { trigger = 'scheduler' } = {}) {
  const cycleId = `cycle_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
  structuredLog('info', 'cycle.start', { cycleId, trigger });

  // MONITOR
  const observations = {
    hosting: await monitorHosting(),
    firestore: await monitorFirestore(db),
    env: readEnvInventory(),
    stripe: await monitorStripe(stripe),
    iam: await monitorIamProbes(),
    deployment: {
      note: 'gcloud/firebase deploy are HITL-only; Functions never rewrite secrets or .env files',
    },
  };

  // PREEMPTIVE: env shape fingerprint (no values) — suppress circuit re-trips on stable drift.
  const prevFp = await loadEnvFingerprintState(db);
  const fp = envDriftFingerprint(observations.env);
  const fpState = await saveEnvFingerprintState(db, fp, prevFp);
  observations.envFingerprint = {
    changed: fpState.changed,
    stableCycles: fpState.stableCycles,
  };

  // ANALYZE
  const analysis = analyze(observations);

  const circuitEvents = [];
  const pausedTypes = new Set();
  for (const finding of analysis.findings || []) {
    const errorType = mapFindingToErrorType(finding.code);
    const isEnvDrift =
      finding.code === 'env_stripe_secret_drift' ||
      finding.code === 'env_webhook_drift' ||
      finding.code === 'env_price_drift';

    // Stable env drift: keep finding for score/HITL, but do not increment circuit hits every 5m.
    if (isEnvDrift && !fpState.changed && fpState.stableCycles > 0) {
      circuitEvents.push({
        errorType,
        state: 'suppressed_stable_env_drift',
        count: 0,
        tripped: false,
        alreadyOpen: true,
        suppressed: true,
      });
      pausedTypes.add(errorType);
      continue;
    }

    const occ = await recordErrorOccurrence(db, errorType, cycleId);
    circuitEvents.push(occ);
    if (occ.tripped || occ.state === 'open') {
      pausedTypes.add(errorType);
      if (occ.tripped && !occ.alreadyOpen) {
        await sendAdminNotify({
          subject: `[Resumora] Circuit OPEN — ${errorType} (human review)`,
          text: [
            'Auto-remediation PAUSED for this error type (circuit trip).',
            `Error type: ${errorType}`,
            `Cycle: ${cycleId}`,
            `Count in window: ${occ.count}`,
            `Window: ${CIRCUIT_WINDOW_MS}ms / trip=${CIRCUIT_TRIP_COUNT} / half-open after ${CIRCUIT_HALF_OPEN_MS}ms`,
            `Dashboard: ${DASHBOARD_URL}`,
            '',
            'FR: Correction automatique en pause — revue humaine requise.',
            'ES: Auto-corrección en pausa — se requiere revisión humana.',
          ].join('\n'),
        });
      }
    }
  }

  const circuitReset = await resetCircuitsIfHealthy(db, analysis);

  // PLAN
  const plan = planRemediations(analysis);

  // EXECUTE (safe only) + HITL for critical
  const executed = [];
  const approvals = [];
  const firstTimeFixes = [];
  const autoPaused = pausedTypes.size > 0;

  for (const finding of analysis.findings || []) {
    const errorType = mapFindingToErrorType(finding.code);
    if (pausedTypes.has(errorType)) continue;
    const first = await autoRemediateFirstTime(db, { errorType, cycleId, analysis });
    firstTimeFixes.push(first);
  }

  for (const action of plan) {
    const guard = preDamageCheck(action, analysis);
    if (!guard.ok) {
      const approval = await createApproval(
        db,
        {
          ...action,
          id: action.id,
          reason: `${action.reason} [preDamageCheck: ${guard.reason}]`,
          risk: RISK.CRITICAL,
        },
        analysis,
        cycleId
      );
      approvals.push({
        actionId: action.id,
        approvalId: approval.id,
        guard: guard.reason,
        deduped: Boolean(approval.deduped),
      });
      if (!approval.deduped) {
        await writeRemediation(db, {
          cycleId,
          actionId: action.id,
          risk: RISK.CRITICAL,
          status: 'awaiting_approval',
          approvalId: approval.id,
          titleKey: action.titleKey,
          guardReason: guard.reason,
        });
      }
      continue;
    }

    if (autoPaused && action.id === 'warmup_endpoints') {
      await writeRemediation(db, {
        cycleId,
        actionId: action.id,
        risk: RISK.SAFE,
        status: 'skipped_circuit_open',
        titleKey: action.titleKey,
      });
      continue;
    }

    if (action.risk === RISK.CRITICAL) {
      const approval = await createApproval(db, action, analysis, cycleId);
      approvals.push({
        actionId: action.id,
        approvalId: approval.id,
        deduped: Boolean(approval.deduped),
      });
      if (!approval.deduped) {
        await writeRemediation(db, {
          cycleId,
          actionId: action.id,
          risk: RISK.CRITICAL,
          status: 'awaiting_approval',
          approvalId: approval.id,
          titleKey: action.titleKey,
        });
      }
      continue;
    }

    if (action.id === 'warmup_endpoints') {
      const attemptGate = await canAttemptRemediation(db, 'HOSTING_WARMUP');
      if (!attemptGate.ok) {
        await writeRemediation(db, {
          cycleId,
          actionId: action.id,
          risk: RISK.SAFE,
          status: 'skipped_remediation_cap',
          titleKey: action.titleKey,
          remediationAttempts: attemptGate.attempts,
        });
        continue;
      }
      await bumpRemediationAttempts(db, 'HOSTING_WARMUP', cycleId);
    }

    let result = { ok: true };
    if (action.id === 'warmup_endpoints') {
      result = await executeWarmup();
    }

    await writeRemediation(db, {
      cycleId,
      actionId: action.id,
      risk: RISK.SAFE,
      status: result.ok ? 'applied' : 'failed',
      result,
      titleKey: action.titleKey,
    });
    executed.push({ actionId: action.id, result });
  }

  // GUARDIAN
  const guardian = await runGuardian(db, stripe);
  if (!guardian.passed && executed.length) {
    // Reflexion: safe patch did not restore health → escalate rollback
    const rollback = await createApproval(
      db,
      {
        id: 'auto_rollback_proposal',
        titleKey: 'heal.action.rollback',
        reason: 'Guardian failed after safe remediation — propose Hosting/Functions rollback',
      },
      {
        ...analysis,
        score: Math.min(analysis.score, guardian.passed ? analysis.score : 35),
        status: 'critical',
      },
      cycleId
    );
    approvals.push({ actionId: 'auto_rollback_proposal', approvalId: rollback.id });
    structuredLog('warn', 'reflexion.rollback', { cycleId, approvalId: rollback.id });
  }

  const incidentId = await writeIncident(db, analysis, cycleId, {
    requiresHumanReview:
      pausedTypes.size > 0 || (analysis.findings || []).some((f) => f.risk === RISK.CRITICAL),
    circuitTripped: circuitEvents.filter((e) => e.tripped).map((e) => e.errorType),
  });

  const snapshot = {
    cycleId,
    trigger,
    updatedAt: FieldValue.serverTimestamp(),
    score: analysis.score,
    status: analysis.status,
    findings: analysis.findings,
    lastObservations: {
      hosting: observations.hosting,
      firestore: observations.firestore,
      stripe: {
        ok: observations.stripe.ok,
        latencyMs: observations.stripe.latencyMs,
        samplePricePresent: observations.stripe.samplePricePresent || false,
        error: observations.stripe.error || null,
      },
      env: observations.env,
    },
    lastPlan: plan,
    lastExecuted: executed,
    lastApprovals: approvals,
    lastGuardian: {
      passed: guardian.passed,
      checks: guardian.checks,
    },
    lastIncidentId: incidentId,
    lastCircuit: {
      events: circuitEvents.map((e) => ({
        errorType: e.errorType,
        state: e.state,
        count: e.count,
        tripped: e.tripped,
      })),
      pausedTypes: [...pausedTypes],
      resetOnHealthy: circuitReset.reset,
    },
    lastFirstTimeFixes: firstTimeFixes,
    activeRemediations: executed
      .filter((e) => e.result && e.result.ok)
      .map((e) => e.actionId)
      .concat(approvals.map((a) => `pending:${a.actionId}`)),
  };

  await db.collection(HEALTH_COL).doc(HEALTH_DOC).set(snapshot, { merge: true });

  const alert = await maybeSendHealthAlert(db, {
    cycleId,
    analysis,
    guardian,
    incidentId,
  });

  structuredLog('info', 'cycle.end', {
    cycleId,
    score: analysis.score,
    status: analysis.status,
    executed: executed.length,
    approvals: approvals.length,
    guardianPassed: guardian.passed,
    alertSent: Boolean(alert && alert.sent),
  });

  return {
    cycleId,
    score: analysis.score,
    status: analysis.status,
    findings: analysis.findings,
    executed,
    approvals,
    guardian: { passed: guardian.passed, checks: guardian.checks },
    incidentId,
    alert,
    circuit: { pausedTypes: [...pausedTypes], events: circuitEvents },
    firstTimeFixes,
  };
}

async function getHealthSnapshot(db) {
  const snap = await db.collection(HEALTH_COL).doc(HEALTH_DOC).get();
  const data = snap.exists ? snap.data() : null;

  async function safeList(col, limit = 25) {
    try {
      const q = await db.collection(col).orderBy('createdAt', 'desc').limit(limit).get();
      return q.docs;
    } catch (_) {
      const q = await db.collection(col).limit(limit).get();
      return q.docs;
    }
  }

  const [incidentDocs, remediationDocs, approvalSnap, notifySnap, circuitSnap, firstFixSnap] =
    await Promise.all([
      safeList(INCIDENTS_COL),
      safeList(REMEDIATIONS_COL),
      db.collection(APPROVALS_COL).where('status', '==', 'pending_approval').limit(25).get(),
      safeList(NOTIFY_COL, 15),
      db.collection(CIRCUIT_COL).limit(40).get(),
      db.collection(FIRST_FIX_COL).limit(40).get(),
    ]);

  async function countQuery(col, field, op, value) {
    try {
      const snap = await db.collection(col).where(field, op, value).limit(50).get();
      return snap.size;
    } catch (_) {
      return 0;
    }
  }

  async function countPublishJobsNeedingReview() {
    try {
      const [failedSnap, partialSnap] = await Promise.all([
        db.collection('media_publish_jobs').where('status', '==', 'failed').limit(50).get(),
        db.collection('media_publish_jobs').where('status', '==', 'partial').limit(50).get(),
      ]);
      return failedSnap.size + partialSnap.size;
    } catch (_) {
      return 0;
    }
  }

  const [humanReviewIncidents, pendingRefunds, failedPublishJobs] = await Promise.all([
    countQuery(INCIDENTS_COL, 'requiresHumanReview', '==', true),
    countQuery('refund_requests', 'status', '==', 'pending_approval'),
    countPublishJobsNeedingReview(),
  ]);

  const serialize = (doc) => {
    const d = doc.data() || {};
    const out = { id: doc.id, ...d };
    for (const key of Object.keys(out)) {
      if (out[key] && typeof out[key].toDate === 'function') {
        out[key] = out[key].toDate().toISOString();
      }
    }
    return out;
  };

  const circuits = circuitSnap.docs.map(serialize);
  const firstTimeFixes = firstFixSnap.docs.map(serialize);
  const firstTried = firstTimeFixes.filter(
    (f) => f.status === 'remediated' || f.status === 'verification_failed'
  );
  const firstOk = firstTimeFixes.filter((f) => f.status === 'remediated').length;
  const rollbacks = remediationDocs
    .map(serialize)
    .filter((r) => r.actionId === 'auto_rollback_proposal' || r.status === 'verification_failed');

  const pendingApprovals = approvalSnap.docs.map(serialize);
  const openCircuits = circuits.filter((c) => c.state === 'open' || c.paused);
  const stripeKycAlert = data?.stripeAccount?.needsAttention ? 1 : 0;
  const criticalAlerts = {
    pendingApprovals: pendingApprovals.length,
    circuitBreakers: openCircuits.length,
    humanReviewIncidents,
    pendingRefunds,
    failedPublishJobs,
    stripeKyc: stripeKycAlert,
  };
  const criticalAlertCount =
    criticalAlerts.pendingApprovals +
    criticalAlerts.circuitBreakers +
    criticalAlerts.humanReviewIncidents +
    criticalAlerts.pendingRefunds +
    criticalAlerts.failedPublishJobs +
    criticalAlerts.stripeKyc;

  return {
    health: data
      ? {
          ...data,
          updatedAt:
            data.updatedAt && typeof data.updatedAt.toDate === 'function'
              ? data.updatedAt.toDate().toISOString()
              : data.updatedAt || null,
          stripeAccount: data.stripeAccount || null,
        }
      : null,
    incidents: incidentDocs.map(serialize),
    remediations: remediationDocs.map(serialize),
    pendingApprovals,
    notificationHistory: notifySnap.map(serialize),
    circuits,
    circuitBreakers: openCircuits,
    criticalAlertCount,
    criticalAlerts,
    firstTimeFixes,
    firstTimeStats: {
      attempted: firstTried.length,
      remediated: firstOk,
      successRate: firstTried.length > 0 ? Math.round((firstOk / firstTried.length) * 100) : null,
    },
    rollbackHistory: rollbacks.slice(0, 20),
  };
}

/**
 * Human decide on critical remediation proposals.
 * Approved actions are recorded as authorized — actual restart/CDN/env rollback
 * still requires ops credentials; we never mutate secrets from this path.
 */
async function decideApproval(db, { approvalId, decision, note }) {
  const ref = db.collection(APPROVALS_COL).doc(String(approvalId));
  const snap = await ref.get();
  if (!snap.exists) {
    const err = new Error('Approval not found');
    err.statusCode = 404;
    throw err;
  }
  const data = snap.data() || {};
  if (data.status !== 'pending_approval') {
    const err = new Error('Approval already decided');
    err.statusCode = 409;
    throw err;
  }

  const approved = decision === 'approve';
  await ref.set(
    {
      status: approved ? 'approved' : 'rejected',
      decidedAt: FieldValue.serverTimestamp(),
      decisionNote: String(note || '').slice(0, 500),
      // Explicit: we do not auto-rotate secrets or rewrite .env from Functions
      executionNote: approved
        ? 'Authorized for ops runbook (gcloud/firebase). Secrets are never rewritten by the agent.'
        : 'Rejected by admin',
    },
    { merge: true }
  );

  await writeRemediation(db, {
    cycleId: data.cycleId || null,
    actionId: data.actionId,
    risk: RISK.CRITICAL,
    status: approved ? 'approved_awaiting_ops' : 'rejected',
    approvalId,
    titleKey: data.titleKey || null,
  });

  if (approved) {
    const findingCodes = Array.isArray(data.findingCodes) ? data.findingCodes : [];
    for (const code of findingCodes) {
      const errorType = mapFindingToErrorType(code);
      await db.collection(CIRCUIT_COL).doc(circuitDocId(errorType)).set(
        {
          state: 'closed',
          paused: false,
          requiresHumanReview: false,
          hits: [],
          countInWindow: 0,
          closedAt: FieldValue.serverTimestamp(),
          closedReason: 'human_approved',
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    }
    await sendAdminNotify({
      subject: `[Resumora Self-Heal] Approved — ${data.actionId}`,
      text: [
        `Approval ${approvalId} authorized.`,
        'Run the matching gcloud/firebase runbook. Agent will not rewrite secret values.',
        `Action: ${data.actionId}`,
      ].join('\n'),
    });
  }

  return { id: approvalId, status: approved ? 'approved' : 'rejected', actionId: data.actionId };
}

module.exports = {
  assertAdminPassword,
  structuredLog,
  readEnvInventory,
  envDriftFingerprint,
  runSelfHealCycle,
  getHealthSnapshot,
  decideApproval,
  runGuardian,
  preDamageCheck,
  autoRemediateFirstTime,
  canAttemptRemediation,
  HEALTH_COL,
  HEALTH_DOC,
  CIRCUIT_WINDOW_MS,
  CIRCUIT_TRIP_COUNT,
  CIRCUIT_HALF_OPEN_MS,
  MAX_REMEDIATION_ATTEMPTS,
};
