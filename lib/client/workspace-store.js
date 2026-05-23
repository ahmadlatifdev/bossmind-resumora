const { ensureEngagementSchema, getSqlClient, saveEvent, upsertTaskState } = require("../shared/neon-memory");
const { hasEntitlement, listEntitlementsForUser } = require("./entitlements-store");
const { getFreeEditsCount } = require("./plan-policy");
const {
  buildEditRequestMetadata,
  resumeLengthFromMetadata,
  normalizeResumeLength,
} = require("./edit-request-options");
const {
  profileWorkspaceDir,
  workspaceRoot,
  removeStoredFile,
  logStorageDiag,
} = require("./document-storage");

const DOC_TYPES = [
  "resume",
  "cover_letter",
  "linkedin_notes",
  "credentials",
  "portfolio",
  "job_description",
  "supporting_file",
  "generated_resume",
];

function projectKey() {
  return process.env.BOSSMIND_PROJECT_KEY || "resumora";
}

async function notifyLifecycle(payload) {
  const url = String(process.env.RESUMORA_POST_PURCHASE_WEBHOOK_URL || "").trim();
  if (!url.startsWith("https://")) return { sent: false, reason: "webhook_unset" };
  const secret = process.env.RESUMORA_POST_PURCHASE_WEBHOOK_SECRET || "";
  const headers = { "Content-Type": "application/json" };
  if (secret) headers.Authorization = `Bearer ${secret}`;
  try {
    const res = await fetch(url, { method: "POST", headers, body: JSON.stringify(payload) });
    return { sent: res.ok, status: res.status };
  } catch (e) {
    return { sent: false, reason: e.message };
  }
}

function normalizePlanId(v) {
  return String(v || "").trim().toLowerCase();
}

function isDocType(v) {
  return DOC_TYPES.includes(String(v || ""));
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
  // Queue generation once documents begin arriving.
  await upsertGenerationStatus({
    profileId,
    planId,
    status: "queued",
    stageMessage: "Documents received. Generation queue started.",
    metadata: { trigger: "document_upload", docType },
  }).catch(() => {});
  await notifyLifecycle({
    event: "resumora.upload_confirmed",
    planId: normalizePlanId(planId),
    customerEmail: null,
    studioUrl: `${String(process.env.NEXT_PUBLIC_SITE_URL || "https://www.resumora.net").replace(/\/$/, "")}/studio`,
    uploadNotice: { docType, originalName },
  }).catch(() => {});
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
  await removeStoredFile(doc.storage_path, {
    profileId,
    planId: doc.plan_id,
    storedName: doc.stored_name,
    docId: doc.id,
  }).catch(() => {});
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
    `SELECT id, plan_id, notes, status, requested_at, accepted_at, resolved_at, metadata
     FROM client_edit_requests
     WHERE profile_id = $1::uuid
       AND ($2 = '' OR plan_id = $2)
     ORDER BY requested_at DESC`,
    [profileId, planId]
  );
  return (rows || []).map((row) => ({
    ...row,
    resumeLength: resumeLengthFromMetadata(row.metadata),
  }));
}

async function createEditRequest({ profileId, planId, notes, resumeLength = "standard" }) {
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
  const length = normalizeResumeLength(resumeLength);
  const metadata = buildEditRequestMetadata(length);
  const rows = await sql.query(
    `INSERT INTO client_edit_requests (profile_id, plan_id, notes, status, metadata)
     VALUES ($1::uuid, $2, $3, 'pending', $4::jsonb)
     RETURNING id, plan_id, notes, status, requested_at, metadata`,
    [profileId, cleanPlan, String(notes || "").trim().slice(0, 4000), JSON.stringify(metadata)]
  );
  const request = rows?.[0]
    ? { ...rows[0], resumeLength: resumeLengthFromMetadata(rows[0].metadata) }
    : null;
  await upsertTaskState({
    projectKey: projectKey(),
    taskKey: `client_edit_request:${request.id}`,
    status: "pending",
    assignedAgent: "client-edit-flow",
    payload: { profileId, planId: cleanPlan, requestId: request.id, resumeLength: length },
  }).catch(() => {});
  await notifyLifecycle({
    event: "resumora.edit_request_received",
    planId: cleanPlan,
    customerEmail: null,
    studioUrl: `${String(process.env.NEXT_PUBLIC_SITE_URL || "https://www.resumora.net").replace(/\/$/, "")}/studio`,
    editRequest: {
      requestId: request.id,
      notesPreview: String(notes).slice(0, 180),
      resumeLength: length,
    },
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
  await notifyLifecycle({
    event: "resumora.edit_request_accepted",
    planId: req.plan_id,
    customerEmail: null,
    studioUrl: `${String(process.env.NEXT_PUBLIC_SITE_URL || "https://www.resumora.net").replace(/\/$/, "")}/studio`,
    editRequest: { requestId: req.id, acceptedBy },
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

async function upsertGenerationStatus({
  profileId,
  planId,
  status,
  stageMessage = "",
  metadata = {},
}) {
  const sql = getSqlClient();
  if (!sql || !profileId) return { ok: false, error: "database_unavailable" };
  await ensureEngagementSchema();
  const rows = await sql.query(
    `INSERT INTO task_state (project_key, task_key, status, assigned_agent, payload, updated_at)
     VALUES ($1, $2, $3, 'resume-generation', $4::jsonb, NOW())
     ON CONFLICT (project_key, task_key) DO UPDATE SET
       status = EXCLUDED.status,
       assigned_agent = EXCLUDED.assigned_agent,
       payload = task_state.payload || EXCLUDED.payload,
       updated_at = NOW()
     RETURNING task_key, status, payload, updated_at`,
    [
      projectKey(),
      `generation:${profileId}:${normalizePlanId(planId)}`,
      status,
      { profileId, planId: normalizePlanId(planId), stageMessage, ...metadata },
    ]
  );
  return { ok: true, generation: rows?.[0] || null };
}

async function getGenerationStatus(profileId, planId) {
  const sql = getSqlClient();
  if (!sql || !profileId) return null;
  const rows = await sql.query(
    `SELECT status, payload, updated_at
     FROM task_state
     WHERE project_key = $1 AND task_key = $2
     LIMIT 1`,
    [projectKey(), `generation:${profileId}:${normalizePlanId(planId)}`]
  );
  return rows?.[0] || null;
}

function buildProgressTracker({ entitlementGranted, paymentConfirmed, docsCount, generationStatus, delivery, freeEditsRemaining }) {
  const completed = {
    accountCreated: true,
    paymentConfirmed,
    documentsUploaded: docsCount > 0,
    resumeInProgress: ["queued", "analyzing", "generating", "reviewing", "finalizing"].includes(generationStatus),
    resumeReady: generationStatus === "ready" || delivery?.status === "ready",
    freeEditAvailable: freeEditsRemaining > 0,
    deliveryCompleted: delivery?.status === "ready" || generationStatus === "ready",
  };
  const steps = [
    { key: "accountCreated", label: "Account Created" },
    { key: "paymentConfirmed", label: "Payment Confirmed" },
    { key: "documentsUploaded", label: "Documents Uploaded" },
    { key: "resumeInProgress", label: "Resume In Progress" },
    { key: "resumeReady", label: "Resume Ready" },
    { key: "freeEditAvailable", label: "Free Edit Available" },
    { key: "deliveryCompleted", label: "Delivery Completed" },
  ].map((s) => ({ ...s, done: Boolean(completed[s.key]) }));
  const done = steps.filter((s) => s.done).length;
  return { steps, percent: Math.round((done / steps.length) * 100) };
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
    const generation = await getGenerationStatus(profileId, planId);
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
    const tracker = buildProgressTracker({
      entitlementGranted: true,
      paymentConfirmed: true,
      docsCount: docs.length,
      generationStatus: generation?.status || "queued",
      delivery,
      freeEditsRemaining: freeEdits.remaining,
    });
    plans.push({
      planId,
      grantedAt: e.granted_at,
      documents: docs,
      editRequests: edits,
      freeEdits,
      generationStatus: generation?.status || "queued",
      generationMeta: generation?.payload || {},
      progressTracker: tracker,
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
  upsertGenerationStatus,
  getGenerationStatus,
  getWorkspaceOverview,
  hasEntitlement,
};
