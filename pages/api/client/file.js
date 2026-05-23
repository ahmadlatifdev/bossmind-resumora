require("../../../lib/shared/ensure-project-env");
const { readEngagementActor } = require("../../../lib/engagement/http-context");
const { ensureEngagementSchema, getSqlClient } = require("../../../lib/shared/neon-memory");
const { sendJson, withJsonApi } = require("../../../lib/api/json-api-handler");
const {
  openDocumentStream,
  fileSyncMessage,
  logStorageDiag,
  getStorageStatus,
  presignEnabled,
  createPresignedReadUrl,
  isS3Ref,
} = require("../../../lib/client/document-storage");

function contentTypeFor(name = "") {
  const lower = name.toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".docx")) return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (lower.endsWith(".doc")) return "application/msword";
  if (lower.endsWith(".txt") || lower.endsWith(".md")) return "text/plain; charset=utf-8";
  return "application/octet-stream";
}

function wantsHtml(req) {
  const accept = String(req.headers.accept || "");
  return accept.includes("text/html") && !accept.includes("application/json");
}

function renderMissingFileHtml(message) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Resumora — Document sync</title>
  <style>
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #050a18; color: #e8ecf4; font-family: Georgia, serif; }
    .card { max-width: 28rem; padding: 2rem; border: 1px solid rgba(201,162,39,.35); border-radius: 12px; background: rgba(8,18,42,.92); }
    h1 { margin: 0 0 .75rem; font-size: 1.15rem; color: #c9a227; }
    p { margin: 0; line-height: 1.55; color: #b8c0d4; font-size: .95rem; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Document synchronization</h1>
    <p>${message.replace(/</g, "&lt;")}</p>
  </div>
</body>
</html>`;
}

async function handleFile(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return sendJson(res, 405, { error: "method_not_allowed" });
  }

  let actor;
  try {
    actor = await readEngagementActor(req, res);
  } catch {
    return sendJson(res, 401, { error: "sign_in_required" });
  }
  if (!actor.profileId) return sendJson(res, 401, { error: "sign_in_required" });

  const id = Number(req.query.id || 0);
  const mode = String(req.query.mode || "download");
  const lang = String(req.query.lang || req.headers["x-resumora-lang"] || "en").toLowerCase() === "fr" ? "fr" : "en";
  if (!id) return sendJson(res, 400, { error: "id_required" });

  await ensureEngagementSchema();
  const sql = getSqlClient();
  if (!sql) return sendJson(res, 503, { error: "database_unavailable" });

  const rows = await sql.query(
    `SELECT id, original_name, stored_name, storage_path, mime_type, plan_id, profile_id
     FROM client_workspace_documents
     WHERE id = $1::bigint AND profile_id = $2::uuid AND removed_at IS NULL
     LIMIT 1`,
    [id, actor.profileId]
  );
  const doc = rows?.[0];
  if (!doc) return sendJson(res, 404, { error: "not_found" });

  const disposition =
    mode === "preview"
      ? `inline; filename="${String(doc.original_name || "file").replace(/"/g, "")}"`
      : `attachment; filename="${String(doc.original_name || "file").replace(/"/g, "")}"`;

  if (presignEnabled() && isS3Ref(doc.storage_path)) {
    const signed = await createPresignedReadUrl(doc.storage_path, {
      expiresIn: 600,
      disposition,
    });
    if (signed.ok && signed.url) {
      logStorageDiag("file_presign_redirect", { docId: doc.id, mode });
      res.setHeader("Cache-Control", "private, no-store");
      res.setHeader("X-Resumora-File-Access", "presigned");
      return res.redirect(302, signed.url);
    }
  }

  const opened = await openDocumentStream(doc.storage_path, {
    docId: doc.id,
    profileId: doc.profile_id,
    planId: doc.plan_id,
    storedName: doc.stored_name,
  });

  if (!opened.ok) {
    const message = fileSyncMessage(lang);
    logStorageDiag("file_missing", {
      docId: doc.id,
      profileId: actor.profileId,
      storagePath: doc.storage_path,
      storageStatus: getStorageStatus(),
      mode,
    });
    res.setHeader("X-Resumora-File-Status", "synchronizing");
    if (wantsHtml(req)) {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      return res.status(404).send(renderMissingFileHtml(message));
    }
    return sendJson(res, 404, { error: "file_missing", message, code: "file_sync" });
  }

  const name = String(doc.original_name || "file");
  const contentType = doc.mime_type || contentTypeFor(name);
  res.setHeader("Content-Type", contentType);
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("X-Resumora-Storage-Provider", opened.provider || "unknown");

  if (mode !== "preview") {
    res.setHeader("Content-Disposition", `attachment; filename="${name.replace(/"/g, "")}"`);
  }

  logStorageDiag("file_stream_start", {
    docId: doc.id,
    mode,
    provider: opened.provider,
    resolvedPath: opened.resolvedPath,
  });

  opened.stream.on("error", (err) => {
    logStorageDiag("file_stream_error", { docId: doc.id, message: err.message });
    if (!res.headersSent) sendJson(res, 500, { error: "stream_failed" });
    else res.end();
  });
  opened.stream.pipe(res);
}

export default withJsonApi(handleFile, { source: "client-file" });
