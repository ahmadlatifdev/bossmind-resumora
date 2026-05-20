const path = require("path");
const fs = require("fs");
const { ensureEngagementSchema, getSqlClient, saveEvent, upsertTaskState } = require("../shared/neon-memory");
const { hasEntitlement, listEntitlementsForUser } = require("./entitlements-store");
const { getFreeEditsCount } = require("./plan-policy");

const DOC_TYPES = [
  "resume",
  "cover_letter",
  "linkedin_notes",
  "credentials",
  "job_description",
  "supporting_file",
  "generated_resume",
];

function projectKey() {
  return process.env.BOSSMIND_PROJECT_KEY || "resumora";
}

function normalizePlanId(v) {
  return String(v || "").trim().toLowerCase();
}

function isDocType(v) {
  return DOC_TYPES.includes(String(v || ""));
}

function workspaceRoot() {
  return path.join(process.cwd(), "tmp", "client-workspace");
}

function profileWorkspaceDir(profileId) {
  const safe = String(profileId || "").replace(/[^a-z0-9-]/gi, "_");
  return path.join(workspaceRoot(), safe);
}

async function listWorkspaceDocuments(profileId, planId = "") {
  const sql = getSqlClient();
  if (!sql || !profileId) return [];
  await ensureEngagementSchema();
  const rows = await sql.query(
    `SELECT id, plan_id, doc_type, original_name, stored_name, mime_type, size_bytes, status,
            created_at, updated_at
     FROM client_workspace_documents
     WHERE profile_id = $1::uuid
       AND removed_at IS NULL
       AND ($2 = '' OR plan_id = $2)
     ORDER BY created_at DESC`,
    [profileId, planId]
  );
  return rows || [];
}

async function addWorkspaceDocument({
  profileId,
  planId,
  docType,
  originalName,
  storedName,
  storagePath,
  mimeType,
  sizeBytes,
}) {
  const sql = getSqlClient();
  if (!sql || !profileId) return { ok: false, error: "database_unavailable" };
  await ensureEngagementSchema();
  if (!isDocType(docType)) return { ok: false, error: "invalid_doc_type" };
  const rows = await sql.query(
    `INSERT INTO client_workspace_documents
      (profile_id, plan_id, doc_type, original_name, stored_name, storage_path, mime_type, size_bytes, status)
     VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8, 'uploaded')
     RETURNING id, plan_id, doc_type, original_name, mime_type, size_bytes, status, created_at`,
    [profileId, normalizePlanId(planId), docType, originalName, storedName, storagePath, mimeType || "", Number(sizeBytes || 0)]
  );
  return { ok: true, document: rows?.[0] || null };
}

async function removeWorkspaceDocument({ profileId, docId }) {
  const sql = getSqlClient();
  if (!sql || !profileId) return { ok: false, error: "database_unavailable" };
  await ensureEngagementSchema();
  const rows = await sql.query(
    `UPDATE client_workspace_documents
     SET removed_at = NOW(), status = 'removed', updated_at = NOW()
     WHERE id = $1::bigint AND profile_id = $2::uuid AND removed_at IS NULL
     RETURNING id, storage_path, original_name, plan_id, doc_type`,
    [docId, profileId]
  );
  const doc = rows?.[0];
  if (!doc) return { ok: false, error: "not_found" };
  try {
    if (doc.storage_path && fs.existsSync(doc.storage_path)) {
      fs.unlinkSync(doc.storage_path);
    }
  } catch {
    /* keep db truth even if file cleanup failed */
  }
  await saveEvent({
    projectKey: projectKey(),
    eventType: "client_document.removed",
    severity: "info",
    source: "client-workspace",
    payload: { profileId, planId: doc.plan_id, docType: doc.doc_type, documentId: doc.id },
  }).catch(() => {});
  return { ok: true, removed: { id: doc.id, originalName: doc.original_name } };
}

async function listEditRequests(profileId, planId = "") {
  const sql = getSqlClient();
  if (!sql || !profileId) return [];
  await ensureEngagementSchema();
  const rows = await sql.query(
    `SELECT id, plan_id, notes, status, requested_at, accepted_at, resolved_at
     FROM client_edit_requests
     WHERE profile_id = $1::uuid
       AND ($2 = '' OR plan_id = $2)
     ORDER BY requested_at DESC`,
    [profileId, planId]
  );
  return rows || [];
}

async function createEditRequest({ profileId, planId, notes }) {
  const sql = getSqlClient();
  if (!sql || !profileId) return { ok: false, error: "database_unavailable" };
  await ensureEngagementSchema();
  const cleanPlan = normalizePlanId(planId);
  const existing = await sql.query(
    `SELECT COUNT(*)::int AS c FROM client_edit_requests
     WHERE profile_id = $1::uuid AND plan_id = $2 AND status IN ('pending', 'accepted')`,
    [profileId, cleanPlan]
  );
  if ((existing?.[0]?.c || 0) >= 3) {
    return { ok: false, error: "too_many_open_requests" };
  }
  const rows = await sql.query(
    `INSERT INTO client_edit_requests (profile_id, plan_id, notes, status)
     VALUES ($1::uuid, $2, $3, 'pending')
     RETURNING id, plan_id, notes, status, requested_at`,
    [profileId, cleanPlan, String(notes || "").trim().slice(0, 4000)]
  );
  const request = rows?.[0] || null;
  await upsertTaskState({
    projectKey: projectKey(),
    taskKey: `client_edit_request:${request.id}`,
    status: "pending",
    assignedAgent: "client-edit-flow",
    payload: { profileId, planId: cleanPlan, requestId: request.id },
  }).catch(() => {});
  return { ok: true, request };
}

async function acceptEditRequest({ requestId, acceptedBy = "admin" }) {
  const sql = getSqlClient();
  if (!sql) return { ok: false, error: "database_unavailable" };
  await ensureEngagementSchema();
  const rows = await sql.query(
    `UPDATE client_edit_requests
     SET status = 'accepted', accepted_at = NOW(), accepted_by = $2
     WHERE id = $1::bigint AND status = 'pending'
     RETURNING id, profile_id, plan_id, status, accepted_at`,
    [requestId, String(acceptedBy).slice(0, 120)]
  );
  const req = rows?.[0];
  if (!req) return { ok: false, error: "not_found_or_not_pending" };
  await saveEvent({
    projectKey: projectKey(),
    eventType: "client_edit_request.accepted",
    severity: "info",
    source: "client-workspace",
    payload: { requestId: req.id, profileId: req.profile_id, planId: req.plan_id },
  }).catch(() => {});
  return { ok: true, request: req };
}

async function getFreeEditsSummary(profileId, planId) {
  const sql = getSqlClient();
  if (!sql || !profileId) return { included: getFreeEditsCount(planId), accepted: 0, remaining: getFreeEditsCount(planId) };
  const included = getFreeEditsCount(planId);
  const rows = await sql.query(
    `SELECT COUNT(*)::int AS c FROM client_edit_requests
     WHERE profile_id = $1::uuid AND plan_id = $2 AND status = 'accepted'`,
    [profileId, normalizePlanId(planId)]
  );
  const accepted = rows?.[0]?.c || 0;
  return { included, accepted, remaining: Math.max(0, included - accepted) };
}

async function upsertDeliveryStatus({
  profileId,
  planId,
  status = "in_progress",
  downloadUrl = null,
  message = null,
  emailStatus = "pending",
  metadata = {},
}) {
  const sql = getSqlClient();
  if (!sql || !profileId) return { ok: false, error: "database_unavailable" };
  await ensureEngagementSchema();
  const rows = await sql.query(
    `INSERT INTO client_delivery_status
      (profile_id, plan_id, status, download_url, message, delivered_at, email_status, metadata)
     VALUES ($1::uuid, $2, $3, $4, $5, CASE WHEN $3 = 'ready' THEN NOW() ELSE NULL END, $6, $7::jsonb)
     ON CONFLICT (profile_id, plan_id) DO UPDATE SET
       status = EXCLUDED.status,
       download_url = COALESCE(EXCLUDED.download_url, client_delivery_status.download_url),
       message = COALESCE(EXCLUDED.message, client_delivery_status.message),
       delivered_at = CASE
         WHEN EXCLUDED.status = 'ready' THEN COALESCE(client_delivery_status.delivered_at, NOW())
         ELSE client_delivery_status.delivered_at
       END,
       email_status = COALESCE(EXCLUDED.email_status, client_delivery_status.email_status),
       metadata = client_delivery_status.metadata || EXCLUDED.metadata,
       updated_at = NOW()
     RETURNING id, profile_id, plan_id, status, download_url, message, delivered_at, email_status, updated_at`,
    [profileId, normalizePlanId(planId), status, downloadUrl, message, emailStatus, metadata]
  );
  return { ok: true, delivery: rows?.[0] || null };
}

async function getWorkspaceOverview(profileId, email, lang = "en") {
  await ensureEngagementSchema();
  const entitlements = await listEntitlementsForUser(profileId, email);
  const plans = [];
  for (const e of entitlements) {
    const planId = e.plan_id;
    const docs = await listWorkspaceDocuments(profileId, planId);
    const edits = await listEditRequests(profileId, planId);
    const freeEdits = await getFreeEditsSummary(profileId, planId);
    const sql = getSqlClient();
    let delivery = null;
    if (sql) {
      const d = await sql.query(
        `SELECT status, download_url, message, delivered_at, email_status, updated_at
         FROM client_delivery_status
         WHERE profile_id = $1::uuid AND plan_id = $2
         LIMIT 1`,
        [profileId, planId]
      );
      delivery = d?.[0] || null;
    }
    plans.push({
      planId,
      grantedAt: e.granted_at,
      documents: docs,
      editRequests: edits,
      freeEdits,
      delivery,
    });
  }
  return { ok: true, lang, plans };
}

module.exports = {
  DOC_TYPES,
  isDocType,
  workspaceRoot,
  profileWorkspaceDir,
  listWorkspaceDocuments,
  addWorkspaceDocument,
  removeWorkspaceDocument,
  listEditRequests,
  createEditRequest,
  acceptEditRequest,
  getFreeEditsSummary,
  upsertDeliveryStatus,
  getWorkspaceOverview,
  hasEntitlement,
};
