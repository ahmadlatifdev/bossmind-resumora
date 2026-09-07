/**
 * Ordered autonomous heal state machine (MAPE-K durable phases).
 * Cloud Functions may advance state + safe warmup only.
 * Stripe secret / IAM / price mutation stays HITL or local ops script
 * (SELF_HEAL_ALLOW_GCLOUD) — never silent secret rewrite from production.
 */
'use strict';

const { FieldValue } = require('firebase-admin/firestore');

const STATE_COL = 'system_health';
const STATE_DOC = 'heal_state_machine';

/** Resolve IAM → Firestore → SCC → Stripe → webhook → prices → prefix → warmup → verify. */
const PHASES = Object.freeze([
  {
    id: 'iam',
    codes: ['iam_policy_block'],
    mode: 'hitl',
    title: 'IAM / invoker policy',
  },
  {
    id: 'firestore',
    codes: ['firestore_unreachable'],
    mode: 'hitl',
    title: 'Firestore access',
  },
  {
    id: 'scc',
    codes: ['scc_critical_finding'],
    mode: 'hitl',
    title: 'SCC CRITICAL acknowledge',
  },
  {
    id: 'stripe_secret',
    codes: ['env_stripe_secret_drift', 'stripe_api_unhealthy'],
    mode: 'hitl',
    title: 'Stripe secret + API',
  },
  {
    id: 'webhook',
    codes: ['env_webhook_drift'],
    mode: 'hitl',
    title: 'Stripe webhook secret',
  },
  {
    id: 'prices',
    codes: ['env_price_drift'],
    mode: 'hitl',
    title: 'Stripe price env vars',
  },
  {
    id: 'checkout_prefix',
    codes: ['checkout_prefix_invalid'],
    mode: 'ops_or_hitl',
    title: 'CHECKOUT_SESSION_PREFIX',
  },
  {
    id: 'hosting',
    codes: ['hosting_probe_failed', 'hosting_high_latency'],
    mode: 'safe',
    title: 'Hosting warmup',
  },
  {
    id: 'guardian_verify',
    codes: [],
    mode: 'verify',
    title: 'Guardian + score verify',
  },
  {
    id: 'healthy',
    codes: [],
    mode: 'terminal',
    title: 'Healthy',
  },
]);

const MAX_PHASE_ATTEMPTS = Number(process.env.SELF_HEAL_SM_MAX_ATTEMPTS || 5);

function findingCodes(findings) {
  return [...new Set((findings || []).map((f) => f && f.code).filter(Boolean))];
}

function phasesNeeded(codes, guardian) {
  const needed = [];
  for (const phase of PHASES) {
    if (phase.id === 'healthy') continue;
    if (phase.id === 'guardian_verify') {
      if (guardian && guardian.passed === false) needed.push(phase);
      continue;
    }
    if (phase.codes.some((c) => codes.includes(c))) needed.push(phase);
  }
  return needed;
}

function emptyState() {
  return {
    status: 'idle',
    currentPhase: null,
    phaseQueue: [],
    attempt: 0,
    maxAttempts: MAX_PHASE_ATTEMPTS,
    history: [],
    lastError: null,
    targetScore: 100,
    note: 'Ordered heal: IAM → Firestore → SCC → Stripe → webhook → prices → prefix → warmup → verify',
  };
}

async function loadState(db) {
  const snap = await db.collection(STATE_COL).doc(STATE_DOC).get();
  if (!snap.exists) return emptyState();
  return { ...emptyState(), ...(snap.data() || {}) };
}

async function saveState(db, patch) {
  const payload = {
    ...patch,
    updatedAt: FieldValue.serverTimestamp(),
  };
  await db.collection(STATE_COL).doc(STATE_DOC).set(payload, { merge: true });
  return payload;
}

/**
 * Advance machine from live analysis. Returns plan for this cycle.
 * Does not mutate secrets or IAM — emits actions for safe/HITL/ops layers.
 */
async function advanceHealStateMachine(db, { analysis, guardian, cycleId }) {
  const codes = findingCodes(analysis && analysis.findings);
  const score = Number(analysis && analysis.score);
  const healthy =
    Number.isFinite(score) &&
    score >= 100 &&
    (!guardian || guardian.passed !== false) &&
    codes.length === 0;

  let state = await loadState(db);
  const history = Array.isArray(state.history) ? state.history.slice(-40) : [];

  if (healthy) {
    const next = {
      ...emptyState(),
      status: 'healthy',
      currentPhase: 'healthy',
      phaseQueue: [],
      attempt: 0,
      lastCycleId: cycleId,
      lastScore: score,
      history: [
        ...history,
        {
          at: new Date().toISOString(),
          cycleId,
          event: 'reached_healthy',
          score,
        },
      ].slice(-40),
    };
    await saveState(db, next);
    return {
      state: next,
      actions: [{ id: 'record_only', risk: 'SAFE', reason: 'state_machine_healthy' }],
      blocked: false,
    };
  }

  const needed = phasesNeeded(codes, guardian);
  const queue = needed.map((p) => p.id);
  const current = needed[0] || PHASES.find((p) => p.id === 'guardian_verify');
  const samePhase = state.currentPhase === (current && current.id);
  const attempt = samePhase ? Number(state.attempt || 0) + 1 : 1;
  const exhausted = attempt > MAX_PHASE_ATTEMPTS;

  const actions = [];
  if (current && current.mode === 'safe') {
    actions.push({
      id: 'warmup_endpoints',
      risk: 'SAFE',
      reason: `state_machine_phase:${current.id}`,
      titleKey: 'heal.action.warmup',
    });
  } else if (current && (current.mode === 'hitl' || current.mode === 'ops_or_hitl')) {
    actions.push({
      id: 'env_rollback_proposal',
      risk: 'CRITICAL',
      reason: `state_machine_phase:${current.id}:requires_ops_or_hitl`,
      titleKey: 'heal.action.envRollback',
      phaseId: current.id,
    });
  } else if (current && current.mode === 'verify') {
    actions.push({
      id: 'record_only',
      risk: 'SAFE',
      reason: 'state_machine_verify_pending',
    });
  }

  if (exhausted) {
    actions.length = 0;
    actions.push({
      id: 'env_rollback_proposal',
      risk: 'CRITICAL',
      reason: `state_machine_exhausted:${current && current.id}`,
      titleKey: 'heal.action.envRollback',
    });
  }

  const next = {
    status: exhausted ? 'blocked_hitl' : 'running',
    currentPhase: current ? current.id : null,
    currentTitle: current ? current.title : null,
    currentMode: current ? current.mode : null,
    phaseQueue: queue,
    attempt,
    maxAttempts: MAX_PHASE_ATTEMPTS,
    lastCycleId: cycleId,
    lastScore: Number.isFinite(score) ? score : null,
    lastFindingCodes: codes,
    lastGuardianPassed: guardian ? Boolean(guardian.passed) : null,
    lastError: exhausted
      ? `Phase ${current && current.id} exceeded ${MAX_PHASE_ATTEMPTS} attempts — HITL required`
      : null,
    opsHint:
      'Local durable remount: SELF_HEAL_ALLOW_GCLOUD=true node scripts/ops-auto-heal-resync.cjs',
    history: [
      ...history,
      {
        at: new Date().toISOString(),
        cycleId,
        phase: current ? current.id : null,
        attempt,
        score: Number.isFinite(score) ? score : null,
        codes,
      },
    ].slice(-40),
    note: emptyState().note,
    targetScore: 100,
  };

  await saveState(db, next);
  return { state: next, actions, blocked: exhausted };
}

module.exports = {
  PHASES,
  STATE_COL,
  STATE_DOC,
  loadState,
  saveState,
  advanceHealStateMachine,
  phasesNeeded,
  findingCodes,
};
