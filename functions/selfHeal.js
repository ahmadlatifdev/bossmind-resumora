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

  score = Math.max(0, Math.min(100, score));
  const status =
    score >= 90 ? 'healthy' : score >= 70 ? 'degraded' : score >= 40 ? 'impaired' : 'critical';

  return { score, status, findings };
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
  return { id: ref.id, ...doc, createdAt: new Date().toISOString() };
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

async function writeIncident(db, analysis, cycleId) {
  if (!analysis.findings || !analysis.findings.length) return null;
  const ref = db.collection(INCIDENTS_COL).doc();
  await ref.set({
    id: ref.id,
    cycleId,
    score: analysis.score,
    status: analysis.status,
    findings: analysis.findings,
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
    deployment: {
      note: 'Recent Hosting releases are reviewed via ops API outside this cycle when credentials allow',
    },
  };

  // ANALYZE
  const analysis = analyze(observations);

  // PLAN
  const plan = planRemediations(analysis);

  // EXECUTE (safe only) + HITL for critical
  const executed = [];
  const approvals = [];
  for (const action of plan) {
    if (action.risk === RISK.CRITICAL) {
      const approval = await createApproval(db, action, analysis, cycleId);
      approvals.push({ actionId: action.id, approvalId: approval.id });
      await writeRemediation(db, {
        cycleId,
        actionId: action.id,
        risk: RISK.CRITICAL,
        status: 'awaiting_approval',
        approvalId: approval.id,
        titleKey: action.titleKey,
      });
      continue;
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

  const incidentId = await writeIncident(db, analysis, cycleId);

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

  const [incidentDocs, remediationDocs, approvalSnap, notifySnap] = await Promise.all([
    safeList(INCIDENTS_COL),
    safeList(REMEDIATIONS_COL),
    db.collection(APPROVALS_COL).where('status', '==', 'pending_approval').limit(25).get(),
    safeList(NOTIFY_COL, 15),
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
    pendingApprovals: approvalSnap.docs.map(serialize),
    notificationHistory: notifySnap.map(serialize),
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
  runSelfHealCycle,
  getHealthSnapshot,
  decideApproval,
  runGuardian,
  HEALTH_COL,
  HEALTH_DOC,
};
