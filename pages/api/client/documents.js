require("../../../lib/shared/ensure-project-env");
const fs = require("fs");
const { readEngagementActor } = require("../../../lib/engagement/http-context");
const { sendJson, withJsonApi } = require("../../../lib/api/json-api-handler");
const { parseMultipartUpload, formidableErrors } = require("../../../lib/client/form-upload-parser");
const { validateUploadFile, sha256File } = require("../../../lib/client/upload-validation");
const { uploadErrorMessage } = require("../../../lib/client/studio-upload-i18n");
const {
  hasEntitlement,
  profileWorkspaceDir,
  addWorkspaceDocument,
  listWorkspaceDocuments,
  removeWorkspaceDocument,
  isDocType,
} = require("../../../lib/client/workspace-store");
const { persistUploadedFile, logStorageDiag, getStorageStatus, removeStoredFile } = require("../../../lib/client/document-storage");

export const config = {
  api: { bodyParser: false },
};

const DEFAULT_DOC_TYPE = "supporting_file";

function resolveLang(req, fields = {}) {
  const header = String(req.headers["x-resumora-lang"] || "").toLowerCase();
  if (header === "fr" || header === "en") return header;
  const field = String(fields.lang?.[0] || fields.lang || "").toLowerCase();
  return field === "fr" ? "fr" : "en";
}

function safeName(name = "file") {
  return String(name).replace(/[^a-zA-Z0-9._-]/g, "-").slice(0, 120);
}

function storedFileName(originalFilename = "upload") {
  return `${Date.now()}-${safeName(originalFilename)}`;
}

function jsonError(res, status, code, lang, extra = {}) {
  return sendJson(res, status, {
    error: code,
    code,
    message: uploadErrorMessage(code, lang),
    ...extra,
  });
}

async function ingestUploadedFile({ actor, planId, docType, file, lang, replaceDocId = null }) {
  const validation = validateUploadFile({
    originalFilename: file.originalFilename,
    mimetype: file.mimetype,
    size: file.size,
    filePath: file.filepath,
  });
  if (!validation.ok) {
    return { ok: false, status: 400, error: validation.error, code: validation.code };
  }

  const originalName = safeName(file.originalFilename || "upload");
  const storedName = storedFileName(originalName);
  const checksum = sha256File(file.filepath);

  const persisted = await persistUploadedFile({
    profileId: actor.profileId,
    planId,
    storedName,
    tempFilePath: file.filepath,
    mimeType: file.mimetype || "",
    sizeBytes: file.size || 0,
  });

  if (!persisted.ok) {
    logStorageDiag("upload_persist_failed", {
      profileId: actor.profileId,
      planId,
      error: persisted.error,
      replaceDocId,
      storageStatus: getStorageStatus(),
    });
    try {
      if (file.filepath && fs.existsSync(file.filepath)) fs.unlinkSync(file.filepath);
    } catch {
      /* ignore */
    }
    const code =
      persisted.error === "s3_upload_failed" && !getStorageStatus().s3Configured
        ? "storage_unconfigured"
        : persisted.error || "upload_failed";
    return { ok: false, status: 500, error: code, code };
  }

  const added = await addWorkspaceDocument({
    profileId: actor.profileId,
    planId,
    docType,
    originalName,
    storedName: persisted.storedName,
    storagePath: persisted.storagePath,
    mimeType: file.mimetype || "",
    sizeBytes: file.size || 0,
  });

  if (!added.ok) {
    await removeStoredFile(persisted.storagePath, {
      profileId: actor.profileId,
      planId,
      storedName: persisted.storedName,
    }).catch(() => {});
    logStorageDiag("upload_metadata_failed", { profileId: actor.profileId, planId, error: added.error });
    return { ok: false, status: 400, error: added.error || "upload_failed", code: added.error };
  }

  logStorageDiag("upload_complete", {
    profileId: actor.profileId,
    planId,
    docId: added.document?.id,
    provider: persisted.provider,
    storagePath: persisted.storagePath,
    checksum,
  });

  return {
    ok: true,
    document: added.document,
    checksum,
    provider: persisted.provider,
    message: uploadErrorMessage("upload_success", lang),
  };
}

async function handleDocuments(req, res) {
  let actor;
  try {
    actor = await readEngagementActor(req, res);
  } catch (e) {
    return jsonError(res, 401, "sign_in_required", "en", { detail: e.message });
  }

  const lang = resolveLang(req);

  if (!actor.profileId) {
    return jsonError(res, 401, "sign_in_required", lang);
  }

  if (req.method === "GET") {
    const planId = String(req.query.planId || "").trim().toLowerCase();
    if (!planId) return jsonError(res, 400, "planId_required", lang, { error: "planId required" });
    const access = await hasEntitlement(actor.profileId, actor.profileEmail, planId);
    if (!access.entitled) return jsonError(res, 403, "not_entitled", lang);
    const items = await listWorkspaceDocuments(actor.profileId, planId);
    return sendJson(res, 200, { items, storage: getStorageStatus() });
  }

  if (req.method === "DELETE") {
    const docId = Number(req.query.id || 0);
    const confirm = String(req.query.confirm || "") === "yes";
    if (!docId || !confirm) {
      return sendJson(res, 400, { error: "id and confirm=yes required" });
    }
    const removed = await removeWorkspaceDocument({ profileId: actor.profileId, docId });
    if (!removed.ok) return jsonError(res, 404, removed.error || "not_found", lang);
    return sendJson(res, 200, { removed: removed.removed });
  }

  if (req.method === "PUT" || req.method === "POST") {
    const dir = profileWorkspaceDir(actor.profileId);
    let fields;
    let files;
    try {
      [fields, files] = await parseMultipartUpload(req, {
        uploadDir: dir,
        maxFileSize: 20 * 1024 * 1024,
        filename: (_name, ext, part) => storedFileName(part.originalFilename || `upload${ext || ""}`),
      });
    } catch (e) {
      if (e?.code === formidableErrors?.biggerThanTotalMaxFileSize || e?.httpCode === 413) {
        return jsonError(res, 413, "file_too_large", resolveLang(req));
      }
      if (e?.code === "formidable_unavailable") {
        return jsonError(res, 503, "formidable_unavailable", resolveLang(req));
      }
      logStorageDiag("multipart_parse_failed", { message: e.message, code: e.code });
      return jsonError(res, 400, "upload_failed", resolveLang(req), { detail: e.message });
    }

    const uploadLang = resolveLang(req, fields);
    const planId = String(fields.planId?.[0] || "").trim().toLowerCase();
    const file = files.file?.[0] || files.resumeFile?.[0];
    if (!file) return jsonError(res, 400, "file_required", uploadLang, { error: "file required" });
    if (!planId) return jsonError(res, 400, "planId_required", uploadLang, { error: "planId required" });

    const access = await hasEntitlement(actor.profileId, actor.profileEmail, planId);
    if (!access.entitled) return jsonError(res, 403, "not_entitled", uploadLang);

    if (req.method === "PUT") {
      const docId = Number(req.query.id || 0);
      if (!docId) return jsonError(res, 400, "id_required", uploadLang, { error: "id required" });
      const existing = await listWorkspaceDocuments(actor.profileId, "");
      const target = existing.find((d) => Number(d.id) === docId);
      if (!target) return jsonError(res, 404, "not_found", uploadLang);
      await removeWorkspaceDocument({ profileId: actor.profileId, docId });
      const docType = target.doc_type || DEFAULT_DOC_TYPE;
      const ingested = await ingestUploadedFile({
        actor,
        planId,
        docType,
        file,
        lang: uploadLang,
        replaceDocId: docId,
      });
      if (!ingested.ok) return jsonError(res, ingested.status, ingested.code || ingested.error, uploadLang);
      const items = await listWorkspaceDocuments(actor.profileId, planId);
      return sendJson(res, 200, {
        document: ingested.document,
        items,
        checksum: ingested.checksum,
        message: ingested.message,
      });
    }

    const docTypeRaw = String(fields.docType?.[0] || DEFAULT_DOC_TYPE).trim().toLowerCase();
    const docType = isDocType(docTypeRaw) ? docTypeRaw : DEFAULT_DOC_TYPE;
    const ingested = await ingestUploadedFile({ actor, planId, docType, file, lang: uploadLang });
    if (!ingested.ok) return jsonError(res, ingested.status, ingested.code || ingested.error, uploadLang);
    const items = await listWorkspaceDocuments(actor.profileId, planId);
    return sendJson(res, 200, {
      document: ingested.document,
      items,
      checksum: ingested.checksum,
      provider: ingested.provider,
      message: ingested.message,
    });
  }

  res.setHeader("Allow", "GET, POST, PUT, DELETE");
  return sendJson(res, 405, { error: "method_not_allowed" });
}

export default withJsonApi(handleDocuments, { source: "client-documents" });
