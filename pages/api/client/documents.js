require("../../../lib/shared/ensure-project-env");
const fs = require("fs");
const path = require("path");
const formidable = require("formidable");
const { readEngagementActor } = require("../../../lib/engagement/http-context");
const {
  hasEntitlement,
  profileWorkspaceDir,
  addWorkspaceDocument,
  listWorkspaceDocuments,
  removeWorkspaceDocument,
  isDocType,
} = require("../../../lib/client/workspace-store");
const { persistUploadedFile, logStorageDiag } = require("../../../lib/client/document-storage");

export const config = {
  api: { bodyParser: false },
};

const DEFAULT_DOC_TYPE = "supporting_file";

function safeName(name = "file") {
  return String(name).replace(/[^a-zA-Z0-9._-]/g, "-").slice(0, 120);
}

function storedFileName(originalFilename = "upload") {
  return `${Date.now()}-${safeName(originalFilename)}`;
}

async function ingestUploadedFile({ actor, planId, docType, file, replaceDocId = null }) {
  const originalName = safeName(file.originalFilename || "upload");
  const storedName = storedFileName(originalName);
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
    });
    try {
      if (file.filepath && fs.existsSync(file.filepath)) fs.unlinkSync(file.filepath);
    } catch {
      /* ignore */
    }
    return { ok: false, status: 500, error: persisted.error || "upload_failed" };
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
    logStorageDiag("upload_metadata_failed", { profileId: actor.profileId, planId, error: added.error });
    return { ok: false, status: 400, error: added.error || "upload_failed" };
  }

  logStorageDiag("upload_complete", {
    profileId: actor.profileId,
    planId,
    docId: added.document?.id,
    provider: persisted.provider,
    storagePath: persisted.storagePath,
  });

  return { ok: true, document: added.document };
}

export default async function handler(req, res) {
  const actor = await readEngagementActor(req, res);
  if (!actor.profileId) {
    return res.status(401).json({ error: "sign_in_required" });
  }

  if (req.method === "GET") {
    const planId = String(req.query.planId || "").trim().toLowerCase();
    if (!planId) return res.status(400).json({ error: "planId required" });
    const access = await hasEntitlement(actor.profileId, actor.profileEmail, planId);
    if (!access.entitled) return res.status(403).json({ error: "not_entitled" });
    const items = await listWorkspaceDocuments(actor.profileId, planId);
    return res.status(200).json({ ok: true, items });
  }

  if (req.method === "DELETE") {
    const docId = Number(req.query.id || 0);
    const confirm = String(req.query.confirm || "") === "yes";
    if (!docId || !confirm) {
      return res.status(400).json({ error: "id and confirm=yes required" });
    }
    const removed = await removeWorkspaceDocument({ profileId: actor.profileId, docId });
    if (!removed.ok) return res.status(404).json({ error: removed.error || "not_found" });
    return res.status(200).json({ ok: true, removed: removed.removed });
  }

  if (req.method === "PUT") {
    const docId = Number(req.query.id || 0);
    if (!docId) return res.status(400).json({ error: "id required" });
    const existing = await listWorkspaceDocuments(actor.profileId, "");
    const target = existing.find((d) => Number(d.id) === docId);
    if (!target) return res.status(404).json({ error: "not_found" });
    await removeWorkspaceDocument({ profileId: actor.profileId, docId });
    const dir = profileWorkspaceDir(actor.profileId);
    fs.mkdirSync(dir, { recursive: true });
    const form = formidable({
      uploadDir: dir,
      keepExtensions: true,
      maxFiles: 1,
      maxFileSize: 20 * 1024 * 1024,
      filename: (_name, ext, part) => storedFileName(part.originalFilename || `upload${ext || ""}`),
    });
    try {
      const [fields, files] = await form.parse(req);
      const planId = String(fields.planId?.[0] || target.plan_id || "").trim().toLowerCase();
      const access = await hasEntitlement(actor.profileId, actor.profileEmail, planId);
      if (!access.entitled) return res.status(403).json({ error: "not_entitled" });
      const file = files.file?.[0] || files.resumeFile?.[0];
      if (!file) return res.status(400).json({ error: "file required" });
      const ingested = await ingestUploadedFile({
        actor,
        planId,
        docType: target.doc_type || DEFAULT_DOC_TYPE,
        file,
        replaceDocId: docId,
      });
      if (!ingested.ok) return res.status(ingested.status).json({ error: ingested.error });
      const items = await listWorkspaceDocuments(actor.profileId, planId);
      return res.status(200).json({ ok: true, document: ingested.document, items });
    } catch (e) {
      return res.status(500).json({ error: e.message || "replace_failed" });
    }
  }

  if (req.method === "POST") {
    const dir = profileWorkspaceDir(actor.profileId);
    fs.mkdirSync(dir, { recursive: true });
    const form = formidable({
      uploadDir: dir,
      keepExtensions: true,
      maxFiles: 1,
      maxFileSize: 20 * 1024 * 1024,
      filename: (_name, ext, part) => storedFileName(part.originalFilename || `upload${ext || ""}`),
    });
    try {
      const [fields, files] = await form.parse(req);
      const planId = String(fields.planId?.[0] || "").trim().toLowerCase();
      const docTypeRaw = String(fields.docType?.[0] || DEFAULT_DOC_TYPE).trim().toLowerCase();
      const docType = isDocType(docTypeRaw) ? docTypeRaw : DEFAULT_DOC_TYPE;
      if (!planId) return res.status(400).json({ error: "planId required" });
      const access = await hasEntitlement(actor.profileId, actor.profileEmail, planId);
      if (!access.entitled) return res.status(403).json({ error: "not_entitled" });

      const file = files.file?.[0] || files.resumeFile?.[0];
      if (!file) return res.status(400).json({ error: "file required" });
      const ingested = await ingestUploadedFile({ actor, planId, docType, file });
      if (!ingested.ok) return res.status(ingested.status).json({ error: ingested.error });
      const items = await listWorkspaceDocuments(actor.profileId, planId);
      return res.status(200).json({ ok: true, document: ingested.document, items });
    } catch (e) {
      return res.status(500).json({ error: e.message || "upload_failed" });
    }
  }

  res.setHeader("Allow", "GET, POST, PUT, DELETE");
  return res.status(405).json({ error: "Method not allowed" });
}
