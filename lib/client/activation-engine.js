/**
 * Idempotent post-checkout activation state machine (server-only).
 *
 * Phases: pending → payment_verified → entitlement_created → workspace_created
 *         → dashboard_ready → completed
 */
const { createStripeServerClient } = require("../marketing/stripe-server");
const { activateFromStripeSession, activateBySessionId } = require("./entitlement-activation");
const { getWorkspaceOverview } = require("./workspace-store");
const { getDeliverableForPlan } = require("./deliverables-catalog");
const {
  listEntitlementsByStripeSession,
  linkEntitlementsToProfile,
} = require("./entitlements-store");
const {
  linkEntitlementByStripeSession,
  finalizeEntitlementBinding,
} = require("./entitlement-activation");
const { getSqlClient, ensureEngagementSchema, saveEvent } = require("../shared/neon-memory");

const PHASES = [
  "pending",
  "payment_verified",
  "entitlement_created",
  "workspace_created",
  "dashboard_ready",
  "completed",
  "failed",
];

const PROJECT_KEY = () => process.env.BOSSMIND_PROJECT_KEY || "resumora";

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function normalizeEmail(email) {
  return String(email || "")
    .trim()
    .toLowerCase();
}

function logEntry(phase, ok, detail = {}) {
  return { phase, ok, at: new Date().toISOString(), ...detail };
}

async function appendRunLog(sql, sessionId, entry) {
  await sql.query(
    `UPDATE client_checkout_activation
     SET logs = logs || $2::jsonb, updated_at = NOW()
     WHERE stripe_session_id = $1`,
    [sessionId, JSON.stringify([entry])]
  );
}

async function setRunPhase(sql, sessionId, phase, extra = {}) {
  const fields = ["phase = $2", "updated_at = NOW()"];
  const vals = [sessionId, phase];
  let i = 3;
  if (extra.profileId !== undefined) {
    fields.push(`profile_id = $${i++}::uuid`);
    vals.push(extra.profileId);
  }
  if (extra.planId !== undefined) {
    fields.push(`plan_id = $${i++}`);
    vals.push(extra.planId);
  }
  if (extra.customerEmail !== undefined) {
    fields.push(`customer_email = $${i++}`);
    vals.push(extra.customerEmail);
  }
  if (extra.failureReason !== undefined) {
    fields.push(`failure_reason = $${i++}`);
    vals.push(extra.failureReason);
  }
  await sql.query(
    `UPDATE client_checkout_activation SET ${fields.join(", ")} WHERE stripe_session_id = $1`,
    vals
  );
}

async function getOrCreateRun(sql, sessionId) {
  const rows = await sql.query(
    `SELECT stripe_session_id, phase, profile_id, plan_id, customer_email, failure_reason, logs
     FROM client_checkout_activation WHERE stripe_session_id = $1 LIMIT 1`,
    [sessionId]
  );
  if (rows?.[0]) return rows[0];
  await sql.query(
    `INSERT INTO client_checkout_activation (stripe_session_id, phase, logs)
     VALUES ($1, 'pending', '[]'::jsonb)
     ON CONFLICT (stripe_session_id) DO NOTHING`,
    [sessionId]
  );
  const again = await sql.query(
    `SELECT stripe_session_id, phase, profile_id, plan_id, customer_email, failure_reason, logs
     FROM client_checkout_activation WHERE stripe_session_id = $1 LIMIT 1`,
    [sessionId]
  );
  return again?.[0] || { stripe_session_id: sessionId, phase: "pending", logs: [] };
}

function mapPlans(base, lang) {
  return (base.plans || []).map((p) => {
    const d = getDeliverableForPlan(p.planId, lang);
    return {
      ...p,
      displayName: d?.displayName || p.planId,
      studioPath: d?.studioPath || "/studio",
      features: d?.features || [],
      freeEditsLabel: d?.freeEditsLabel || "",
    };
  });
}

function minimalPlan(planId, lang) {
  const d = getDeliverableForPlan(planId, lang);
  return [
    {
      planId,
      displayName: d?.displayName || planId,
      studioPath: d?.studioPath || "/studio",
      documents: [],
      generationStatus: "queued",
      freeEdits: { included: 0, accepted: 0, remaining: 0 },
      editRequests: [],
      generationMeta: {},
      progressTracker: { steps: [], percent: 0 },
      delivery: null,
      grantedAt: new Date().toISOString(),
    },
  ];
}

function buildCompletePayload(actor, { planId, plans, stripeEmail, lang }) {
  const deliverable = getDeliverableForPlan(planId, lang);
  return {
    ok: true,
    activationStatus: "complete",
    activationSuccess: true,
    phase: "completed",
    failedStep: null,
    signedIn: Boolean(actor?.profileId),
    needsSignIn: false,
    hasAccess: true,
    fulfillmentOk: true,
    planId,
    displayName: deliverable?.displayName || planId,
    plans,
    plansCount: plans.length,
    stripeCheckoutEmail: stripeEmail || null,
    email: actor?.profileEmail || stripeEmail || null,
    redirectTo: "/studio",
    activationComplete: true,
    preload: { studio: "/studio" },
    activation: {
      paymentConfirmed: true,
      planActivated: true,
      workspaceReady: true,
      uploadsUnlocked: true,
      generationReady: true,
    },
  };
}

async function resolveWorkspace(actor, planId, lang) {
  if (!actor?.profileId) return [];
  const base = await getWorkspaceOverview(actor.profileId, actor.profileEmail, lang);
  let plans = mapPlans(base, lang);
  if (!plans.length && planId) plans = minimalPlan(planId, lang);
  return plans;
}

async function tryCompleteFromDatabase(actor, sessionId, lang, sql, logs) {
  const rows = await listEntitlementsByStripeSession(sessionId);
  if (!rows.length) return null;

  const planId = rows[0].plan_id;
  const stripeEmail = normalizeEmail(rows[0].customer_email);

  if (!actor?.profileId) {
    await setRunPhase(sql, sessionId, "payment_verified", { planId, customerEmail: stripeEmail });
    logs.push(logEntry("payment_verified", true, { source: "entitlement_row" }));
    return {
      ok: true,
      activationStatus: "needs_sign_in",
      activationSuccess: false,
      phase: "payment_verified",
      needsSignIn: true,
      signedIn: false,
      hasAccess: false,
      planId,
      stripeCheckoutEmail: stripeEmail,
      redirectTo: `/login?next=${encodeURIComponent(`/studio?session_id=${encodeURIComponent(sessionId)}`)}`,
      logs,
    };
  }

  await linkEntitlementByStripeSession(actor.profileId, sessionId);
  if (stripeEmail) await linkEntitlementsToProfile(actor.profileId, stripeEmail);
  if (actor.profileEmail) await linkEntitlementsToProfile(actor.profileId, actor.profileEmail);

  const plans = await resolveWorkspace(actor, planId, lang);
  await setRunPhase(sql, sessionId, "completed", {
    profileId: actor.profileId,
    planId,
    customerEmail: stripeEmail || actor.profileEmail,
  });
  logs.push(logEntry("completed", true, { source: "database_entitlement", plansCount: plans.length }));

  return { ...buildCompletePayload(actor, { planId, plans, stripeEmail, lang }), logs };
}

/**
 * Run full activation engine (idempotent).
 */
async function runActivationEngine(actor, sessionId, { lang = "en", stripeSession = null, maxAttempts = 1 } = {}) {
  const sid = String(sessionId || "").trim();
  const logs = [];
  if (!sid) {
    return {
      ok: false,
      activationStatus: "failed",
      activationSuccess: false,
      phase: "failed",
      failedStep: "missing_session_id",
      logs,
    };
  }

  await ensureEngagementSchema();
  const sql = getSqlClient();
  if (!sql) {
    return {
      ok: false,
      activationStatus: "failed",
      activationSuccess: false,
      phase: "failed",
      failedStep: "database_save",
      logs: [logEntry("database_save", false)],
    };
  }

  let run = await getOrCreateRun(sql, sid);
  if (run.phase === "completed") {
    const cached = await tryCompleteFromDatabase(actor, sid, lang, sql, logs);
    if (cached?.activationStatus === "complete") {
      cached.idempotent = true;
      return cached;
    }
  }

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    logs.push(logEntry("attempt", true, { attempt, maxAttempts }));

    const dbHit = await tryCompleteFromDatabase(actor, sid, lang, sql, logs);
    if (dbHit?.activationStatus === "complete") return dbHit;
    if (dbHit?.activationStatus === "needs_sign_in") return dbHit;

    let session = stripeSession;
    const { stripe, reason: stripeReason } = createStripeServerClient();

    if (!session && stripe) {
      try {
        session = await stripe.checkout.sessions.retrieve(sid, {
          expand: ["line_items.data.price", "customer_details"],
        });
        logs.push(logEntry("payment_verified", true, { paymentStatus: session.payment_status }));
        await appendRunLog(sql, sid, logEntry("payment_verified", true, { attempt }));
        await setRunPhase(sql, sid, "payment_verified", {
          customerEmail: normalizeEmail(
            session.customer_details?.email || session.customer_email
          ),
        });
      } catch (e) {
        logs.push(logEntry("payment_verified", false, { error: e.message, stripeReason }));
        await appendRunLog(sql, sid, logEntry("payment_verified", false, { error: e.message }));
        console.error("[activation-engine] stripe_lookup_failed", sid.slice(0, 24), e.message);

        const fallback = await tryCompleteFromDatabase(actor, sid, lang, sql, logs);
        if (fallback) return fallback;

        if (attempt < maxAttempts) {
          await sleep(800 * attempt);
          continue;
        }
        await setRunPhase(sql, sid, "failed", { failureReason: "stripe_lookup_failed" });
        return {
          ok: false,
          activationStatus: "needs_sign_in",
          activationSuccess: false,
          phase: "failed",
          failedStep: "stripe_lookup_failed",
          needsSignIn: !actor?.profileId,
          signedIn: Boolean(actor?.profileId),
          redirectTo: `/login?next=${encodeURIComponent(`/studio?session_id=${encodeURIComponent(sid)}`)}`,
          logs,
        };
      }
    } else if (!session && !stripe) {
      logs.push(logEntry("payment_verified", false, { reason: stripeReason || "stripe_unconfigured" }));
      console.error("[activation-engine] stripe_unconfigured", stripeReason);

      const fallback = await tryCompleteFromDatabase(actor, sid, lang, sql, logs);
      if (fallback) return fallback;

      if (attempt < maxAttempts) {
        await sleep(800 * attempt);
        continue;
      }
      return {
        ok: false,
        activationStatus: "needs_sign_in",
        activationSuccess: false,
        phase: "failed",
        failedStep: "stripe_unconfigured",
        needsSignIn: !actor?.profileId,
        redirectTo: `/login?next=${encodeURIComponent(`/studio?session_id=${encodeURIComponent(sid)}`)}`,
        logs,
      };
    }

    if (session && session.payment_status !== "paid") {
      logs.push(logEntry("payment_verified", false, { paymentStatus: session.payment_status }));
      if (attempt < maxAttempts) {
        await sleep(1000 * attempt);
        session = null;
        continue;
      }
      return {
        ok: false,
        activationStatus: "pending",
        activationSuccess: false,
        phase: "payment_verified",
        failedStep: "payment_not_paid",
        logs,
      };
    }

    let activation = await activateFromStripeSession(session, {
      profileId: actor?.profileId || null,
      profileEmail: actor?.profileEmail || null,
      lang,
    });

    if (!activation.planId || !activation.planActivated) {
      logs.push(logEntry("entitlement_created", false, { reason: activation.reason }));
      console.error("[activation-engine] entitlement_failed", activation.reason);
      const fallback = await tryCompleteFromDatabase(actor, sid, lang, sql, logs);
      if (fallback) return fallback;
      if (attempt < maxAttempts) {
        await sleep(800 * attempt);
        continue;
      }
      await setRunPhase(sql, sid, "failed", { failureReason: "entitlement_grant_failed" });
      return {
        ok: false,
        activationStatus: "needs_sign_in",
        activationSuccess: false,
        phase: "failed",
        failedStep: "entitlement_grant",
        needsSignIn: !actor?.profileId,
        redirectTo: `/login?next=${encodeURIComponent(`/studio?session_id=${encodeURIComponent(sid)}`)}`,
        logs,
      };
    }

    await setRunPhase(sql, sid, "entitlement_created", {
      profileId: actor?.profileId || null,
      planId: activation.planId,
      customerEmail: normalizeEmail(activation.stripeCheckoutEmail || actor?.profileEmail),
    });
    logs.push(logEntry("entitlement_created", true, { planId: activation.planId }));

    if (actor?.profileId) {
      await finalizeEntitlementBinding(actor.profileId, actor.profileEmail, session);
      if (!activation.plans?.length) {
        activation = await activateBySessionId(sid, actor, lang);
      }
      const plans = await resolveWorkspace(actor, activation.planId, lang);
      await setRunPhase(sql, sid, "workspace_created", { profileId: actor.profileId });
      logs.push(logEntry("workspace_created", true, { plansCount: plans.length }));

      await setRunPhase(sql, sid, "dashboard_ready", { profileId: actor.profileId });
      await setRunPhase(sql, sid, "completed", { profileId: actor.profileId });
      logs.push(logEntry("completed", true));

      await saveEvent({
        projectKey: PROJECT_KEY(),
        eventType: "checkout_activation.completed",
        severity: "info",
        source: "activation-engine",
        eventKey: `activation:${sid}`,
        payload: { planId: activation.planId, profileId: actor.profileId, attempt },
      }).catch(() => {});

      return {
        ...buildCompletePayload(actor, {
          planId: activation.planId,
          plans,
          stripeEmail: activation.stripeCheckoutEmail,
          lang,
        }),
        logs,
      };
    }

    const stripeEmail = normalizeEmail(activation.stripeCheckoutEmail);
    await setRunPhase(sql, sid, "entitlement_created", { planId: activation.planId, customerEmail: stripeEmail });
    return {
      ok: true,
      activationStatus: "needs_sign_in",
      activationSuccess: false,
      phase: "entitlement_created",
      needsSignIn: true,
      signedIn: false,
      hasAccess: false,
      planId: activation.planId,
      stripeCheckoutEmail: stripeEmail,
      redirectTo: `/login?next=${encodeURIComponent(`/studio?session_id=${encodeURIComponent(sid)}`)}`,
      logs,
    };
  }

  return {
    ok: false,
    activationStatus: "failed",
    activationSuccess: false,
    phase: "failed",
    failedStep: "max_attempts",
    logs,
  };
}

module.exports = {
  runActivationEngine,
  PHASES,
};
