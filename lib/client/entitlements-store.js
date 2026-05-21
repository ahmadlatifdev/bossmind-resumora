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

function loadCatalogMaps() {
  try {
    return require("../../config/resumora-client-deliverables.json");
  } catch {
    return { serviceKeyToPlanId: {}, purchasedPlanToGrantPlanId: {} };
  }
}

/** Map Stripe/catalog plan ids (including addons) to a grantable studio plan id. */
function resolveGrantPlanId(planId) {
  const raw = String(planId || "").trim();
  if (isAllowedPlanId(raw)) return raw;
  const catalog = loadCatalogMaps();
  return catalog.purchasedPlanToGrantPlanId?.[raw] || null;
}

async function listEntitlementsByStripeSession(stripeSessionId) {
  const sql = getSqlClient();
  if (!sql || !stripeSessionId) return [];
  const rows = await sql.query(
    `SELECT plan_id, granted_at, stripe_session_id, metadata, profile_id, customer_email
     FROM client_entitlements
     WHERE stripe_session_id = $1
     ORDER BY granted_at DESC`,
    [stripeSessionId]
  );
  return rows || [];
}

async function grantEntitlement({
  planId,
  profileId = null,
  customerEmail = null,
  stripeSessionId = null,
  metadata = {},
}) {
  const grantPlanId = resolveGrantPlanId(planId);
  if (!grantPlanId) {
    return { ok: false, error: "invalid_plan_id" };
  }
  const mergedMeta = {
    ...metadata,
    ...(grantPlanId !== planId && planId ? { purchased_plan_id: planId } : {}),
  };
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
        [grantPlanId, profileId]
      )
    : await sql.query(
        `SELECT id FROM client_entitlements WHERE plan_id = $1 AND LOWER(customer_email) = $2 LIMIT 1`,
        [grantPlanId, email]
      );

  if (stripeSessionId) {
    const bySession = await sql.query(
      `SELECT id FROM client_entitlements WHERE stripe_session_id = $1 LIMIT 1`,
      [stripeSessionId]
    );
    if (bySession?.length) {
      const rows = await sql.query(
        `UPDATE client_entitlements SET
           profile_id = COALESCE($1::uuid, profile_id),
           plan_id = $2,
           stripe_session_id = COALESCE($3, stripe_session_id),
           customer_email = COALESCE($4, customer_email),
           metadata = metadata || $5::jsonb,
           granted_at = NOW()
         WHERE id = $6
         RETURNING id, profile_id, plan_id, granted_at`,
        [profileId, grantPlanId, stripeSessionId, email || null, mergedMeta, bySession[0].id]
      );
      return { ok: true, entitlement: rows?.[0], updated: true };
    }
  }

  if (existing?.length) {
    const rows = await sql.query(
      `UPDATE client_entitlements SET
         profile_id = COALESCE($1::uuid, profile_id),
         stripe_session_id = COALESCE($2, stripe_session_id),
         customer_email = COALESCE($3, customer_email),
         metadata = metadata || $4::jsonb,
         granted_at = NOW()
       WHERE id = $5
       RETURNING id, profile_id, plan_id, granted_at`,
      [profileId, stripeSessionId, email || null, mergedMeta, existing[0].id]
    );
    return { ok: true, entitlement: rows?.[0], updated: true };
  }

  const rows = await sql.query(
    `INSERT INTO client_entitlements (profile_id, customer_email, plan_id, stripe_session_id, metadata)
     VALUES ($1::uuid, $2, $3, $4, $5::jsonb)
     RETURNING id, profile_id, plan_id, granted_at`,
    [profileId, email || null, grantPlanId, stripeSessionId, mergedMeta]
  );
  return { ok: true, entitlement: rows[0] };
}

async function linkEntitlementsToProfile(profileId, email) {
  const sql = getSqlClient();
  if (!sql || !profileId) return { linked: 0 };
  const norm = normalizeEmail(email);
  if (!norm) return { linked: 0 };

  const rows = await sql.query(
    `UPDATE client_entitlements SET profile_id = $1::uuid, granted_at = NOW()
     WHERE (profile_id IS NULL OR profile_id = $1::uuid)
       AND (
         LOWER(customer_email) = $2
         OR LOWER(customer_email) = (SELECT LOWER(email) FROM engagement_profiles WHERE id = $1::uuid LIMIT 1)
       )
     RETURNING id, plan_id`,
    [profileId, norm]
  );
  return { linked: rows?.length ?? 0, plans: rows || [] };
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
    `SELECT plan_id, granted_at, stripe_session_id, metadata, profile_id
     FROM client_entitlements
     WHERE ($1::uuid IS NOT NULL AND profile_id = $1::uuid)
        OR ($2 <> '' AND LOWER(customer_email) = $2)
        OR ($1::uuid IS NOT NULL AND LOWER(customer_email) = (
          SELECT LOWER(email) FROM engagement_profiles WHERE id = $1::uuid LIMIT 1
        ))
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
  const grantFromRaw = resolveGrantPlanId(raw);
  if (grantFromRaw) return grantFromRaw;

  const planIdsRaw = String(meta.plan_ids || meta.planIds || "");
  const fromList = planIdsRaw
    .split(",")
    .map((s) => s.trim())
    .find((id) => isAllowedPlanId(id) || resolveGrantPlanId(id));
  if (fromList) return resolveGrantPlanId(fromList) || fromList;

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

async function fulfillStripeCheckoutSession(session, options = {}) {
  const { activateFromStripeSession } = require("./entitlement-activation");
  const result = await activateFromStripeSession(session, {
    profileId: options.profileId || null,
    profileEmail: options.profileEmail || null,
    lang: options.lang || "en",
  });
  if (!result.planId) return { ok: false, fulfilled: false, reason: result.reason || "plan_id_unresolved" };
  if (!result.grantResult?.ok) return { ok: false, fulfilled: false, reason: "grant_failed" };
  return {
    ok: true,
    fulfilled: true,
    entitlement: result.grantResult.entitlement,
    planId: result.planId,
    ...result,
  };
}

module.exports = {
  ALLOWED_PLAN_IDS,
  PLAN_ESSENTIAL_ADVANCED,
  isAllowedPlanId,
  resolveGrantPlanId,
  listEntitlementsByStripeSession,
  grantEntitlement,
  linkEntitlementsToProfile,
  hasEntitlement,
  listEntitlementsForUser,
  listProgress,
  upsertProgress,
  resolvePlanIdFromStripeSession,
  fulfillStripeCheckoutSession,
};
