const { getSqlClient, ensureEngagementSchema } = require("../shared/neon-memory");

const ALLOWED_PLAN_IDS = ["basic", "professional", "elite", "essential_advanced"];
const PLAN_ESSENTIAL_ADVANCED = "essential_advanced";

function normalizeEmail(email) {
  return String(email || "")
    .trim()
    .toLowerCase();
}

function isAllowedPlanId(planId) {
  return ALLOWED_PLAN_IDS.includes(planId);
}

async function grantEntitlement({
  planId,
  profileId = null,
  customerEmail = null,
  stripeSessionId = null,
  metadata = {},
}) {
  if (!isAllowedPlanId(planId)) {
    return { ok: false, error: "invalid_plan_id" };
  }
  const sql = getSqlClient();
  if (!sql) return { ok: false, error: "database_unavailable" };
  await ensureEngagementSchema();

  const email = normalizeEmail(customerEmail);
  if (!profileId && !email) {
    return { ok: false, error: "profile_or_email_required" };
  }

  const existing = profileId
    ? await sql.query(
        `SELECT id FROM client_entitlements WHERE plan_id = $1 AND profile_id = $2::uuid LIMIT 1`,
        [planId, profileId]
      )
    : await sql.query(
        `SELECT id FROM client_entitlements WHERE plan_id = $1 AND LOWER(customer_email) = $2 LIMIT 1`,
        [planId, email]
      );

  if (existing?.length) {
    const rows = await sql.query(
      `UPDATE client_entitlements SET
         stripe_session_id = COALESCE($1, stripe_session_id),
         customer_email = COALESCE($2, customer_email),
         metadata = metadata || $3::jsonb,
         granted_at = NOW()
       WHERE id = $4
       RETURNING id, profile_id, plan_id, granted_at`,
      [stripeSessionId, email || null, metadata, existing[0].id]
    );
    return { ok: true, entitlement: rows[0], updated: true };
  }

  const rows = await sql.query(
    `INSERT INTO client_entitlements (profile_id, customer_email, plan_id, stripe_session_id, metadata)
     VALUES ($1::uuid, $2, $3, $4, $5::jsonb)
     RETURNING id, profile_id, plan_id, granted_at`,
    [profileId, email || null, planId, stripeSessionId, metadata]
  );
  return { ok: true, entitlement: rows[0] };
}

async function linkEntitlementsToProfile(profileId, email) {
  const sql = getSqlClient();
  if (!sql || !profileId) return { linked: 0 };
  const norm = normalizeEmail(email);
  if (!norm) return { linked: 0 };

  const rows = await sql.query(
    `UPDATE client_entitlements SET profile_id = $1::uuid
     WHERE profile_id IS NULL AND LOWER(customer_email) = $2
     RETURNING id`,
    [profileId, norm]
  );
  return { linked: rows?.length ?? 0 };
}

async function hasEntitlement(profileId, email, planId) {
  if (!isAllowedPlanId(planId)) return { entitled: false, reason: "invalid_plan" };
  if (
    process.env.BOSSMIND_CLIENT_STUDIO_PREVIEW === "1" ||
    (planId === "essential_advanced" && process.env.BOSSMIND_EA_STUDIO_PREVIEW === "1")
  ) {
    return { entitled: true, source: "preview_env" };
  }
  const sql = getSqlClient();
  if (!sql) return { entitled: false, reason: "database_unavailable" };

  const norm = normalizeEmail(email);
  if (profileId) {
    const rows = await sql.query(
      `SELECT id, granted_at FROM client_entitlements
       WHERE plan_id = $1 AND profile_id = $2::uuid LIMIT 1`,
      [planId, profileId]
    );
    if (rows?.length) return { entitled: true, source: "profile", grantedAt: rows[0].granted_at };
  }
  if (norm) {
    const rows = await sql.query(
      `SELECT id, granted_at FROM client_entitlements
       WHERE plan_id = $1 AND (
         profile_id = (SELECT id FROM engagement_profiles WHERE LOWER(email) = $2 LIMIT 1)
         OR LOWER(customer_email) = $2
       ) LIMIT 1`,
      [planId, norm]
    );
    if (rows?.length) return { entitled: true, source: "email", grantedAt: rows[0].granted_at };
  }
  return { entitled: false };
}

async function listEntitlementsForUser(profileId, email) {
  const sql = getSqlClient();
  if (!sql) return [];
  const norm = normalizeEmail(email);
  if (!profileId && !norm) return [];

  const rows = await sql.query(
    `SELECT plan_id, granted_at, stripe_session_id, metadata
     FROM client_entitlements
     WHERE ($1::uuid IS NOT NULL AND profile_id = $1::uuid)
        OR ($2 <> '' AND LOWER(customer_email) = $2)
     ORDER BY granted_at DESC`,
    [profileId, norm]
  );
  return rows || [];
}

async function listProgress(profileId) {
  const sql = getSqlClient();
  if (!sql || !profileId) return [];
  const rows = await sql.query(
    `SELECT asset_key, completed, updated_at FROM client_prep_progress WHERE profile_id = $1::uuid`,
    [profileId]
  );
  return rows || [];
}

async function upsertProgress(profileId, assetKey, completed = true) {
  const sql = getSqlClient();
  if (!sql || !profileId) return null;
  const rows = await sql.query(
    `INSERT INTO client_prep_progress (profile_id, asset_key, completed)
     VALUES ($1::uuid, $2, $3)
     ON CONFLICT (profile_id, asset_key) DO UPDATE SET
       completed = EXCLUDED.completed,
       updated_at = NOW()
     RETURNING asset_key, completed, updated_at`,
    [profileId, assetKey, completed]
  );
  return rows?.[0] || null;
}

function resolvePlanIdFromStripeSession(session) {
  const meta = session?.metadata || {};
  const raw =
    meta.plan_id ||
    meta.planId ||
    session?.client_reference_id ||
    meta.bossmind_plan_id ||
    "";

  if (isAllowedPlanId(raw)) return raw;

  let catalog;
  try {
    catalog = require("../../config/resumora-client-deliverables.json");
  } catch {
    catalog = { serviceKeyToPlanId: {} };
  }
  const sk = meta.bossmind_service_key || meta.service_key || "";
  if (sk && catalog.serviceKeyToPlanId?.[sk]) {
    return catalog.serviceKeyToPlanId[sk];
  }
  return null;
}

async function fulfillStripeCheckoutSession(session) {
  const planId = resolvePlanIdFromStripeSession(session);
  if (!planId) return { fulfilled: false, reason: "plan_id_unresolved" };
  if (session.payment_status !== "paid") {
    return { fulfilled: false, reason: "not_paid" };
  }

  const email =
    session.customer_details?.email ||
    session.customer_email ||
    session.metadata?.customer_email ||
    null;

  return grantEntitlement({
    planId,
    customerEmail: email,
    stripeSessionId: session.id,
    metadata: {
      amount_total: session.amount_total,
      currency: session.currency,
      payment_link: Boolean(session.payment_link),
      stripe_mode: session.livemode ? "live" : "test",
    },
  });
}

module.exports = {
  ALLOWED_PLAN_IDS,
  PLAN_ESSENTIAL_ADVANCED,
  isAllowedPlanId,
  grantEntitlement,
  linkEntitlementsToProfile,
  hasEntitlement,
  listEntitlementsForUser,
  listProgress,
  upsertProgress,
  resolvePlanIdFromStripeSession,
  fulfillStripeCheckoutSession,
};
