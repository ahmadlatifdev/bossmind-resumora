const fs = require("fs");
const path = require("path");
const { S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand, DeleteObjectCommand } = require("@aws-sdk/client-s3");
const { saveEvent } = require("../shared/neon-memory");

const S3_PREFIX = "s3:";
const DEFAULT_PREFIX = "client-workspace";

function projectKey() {
  return process.env.BOSSMIND_PROJECT_KEY || "resumora";
}

function logStorageDiag(code, payload = {}) {
  const detail = { code, ...payload, at: new Date().toISOString() };
  console.info("[client-document-storage]", code, detail);
  saveEvent({
    projectKey: projectKey(),
    eventType: `client_document_storage.${code}`,
    severity: code.includes("missing") || code.includes("failed") ? "warn" : "info",
    source: "client-document-storage",
    payload: detail,
  }).catch(() => {});
}

function workspaceRoot() {
  return path.join(process.cwd(), "tmp", DEFAULT_PREFIX);
}

function profileWorkspaceDir(profileId) {
  const safe = String(profileId || "").replace(/[^a-z0-9-]/gi, "_");
  return path.join(workspaceRoot(), safe);
}

function s3Config() {
  const bucket = String(process.env.S3_BUCKET || process.env.AWS_S3_BUCKET || "").trim();
  const accessKeyId = String(process.env.AWS_ACCESS_KEY_ID || process.env.S3_ACCESS_KEY_ID || "").trim();
  const secretAccessKey = String(process.env.AWS_SECRET_ACCESS_KEY || process.env.S3_SECRET_ACCESS_KEY || "").trim();
  const region = String(process.env.AWS_REGION || process.env.S3_REGION || "us-east-1").trim();
  const endpoint = String(process.env.S3_ENDPOINT || process.env.AWS_ENDPOINT_URL || "").trim();
  return { bucket, accessKeyId, secretAccessKey, region, endpoint };
}

function isS3Enabled() {
  const forced = String(process.env.CLIENT_DOCUMENT_STORAGE || "").trim().toLowerCase();
  if (forced === "local") return false;
  if (forced === "s3") {
    const { bucket, accessKeyId, secretAccessKey } = s3Config();
    return Boolean(bucket && accessKeyId && secretAccessKey);
  }
  const { bucket, accessKeyId, secretAccessKey } = s3Config();
  return Boolean(bucket && accessKeyId && secretAccessKey);
}

let s3ClientCache = null;

function getS3Client() {
  if (s3ClientCache) return s3ClientCache;
  const { region, endpoint, accessKeyId, secretAccessKey } = s3Config();
  const config = {
    region,
    credentials: { accessKeyId, secretAccessKey },
  };
  if (endpoint) {
    config.endpoint = endpoint;
    config.forcePathStyle = String(process.env.S3_FORCE_PATH_STYLE || "true") !== "false";
  }
  s3ClientCache = new S3Client(config);
  return s3ClientCache;
}

function buildObjectKey(profileId, planId, storedName) {
  const safeProfile = String(profileId || "").replace(/[^a-z0-9-]/gi, "_");
  const safePlan = String(planId || "general").trim().toLowerCase().replace(/[^a-z0-9_-]/g, "_");
  const safeName = String(storedName || "file").replace(/[^a-zA-Z0-9._-]/g, "-").slice(0, 160);
  const root = String(process.env.S3_OBJECT_PREFIX || DEFAULT_PREFIX).replace(/^\/+|\/+$/g, "");
  return `${root}/${safeProfile}/${safePlan}/${safeName}`;
}

function encodeS3Ref(objectKey) {
  return `${S3_PREFIX}${objectKey}`;
}

function isS3Ref(storageRef) {
  return String(storageRef || "").startsWith(S3_PREFIX);
}

function decodeS3Ref(storageRef) {
  return String(storageRef || "").slice(S3_PREFIX.length);
}

function getStorageStatus() {
  const cfg = s3Config();
  return {
    provider: isS3Enabled() ? "s3" : "local",
    s3Configured: Boolean(cfg.bucket && cfg.accessKeyId && cfg.secretAccessKey),
    bucket: cfg.bucket || null,
    region: cfg.region,
    endpoint: cfg.endpoint || null,
    workspaceRoot: workspaceRoot(),
  };
}

async function verifyReadable(storageRef, { profileId, planId, storedName } = {}) {
  if (isS3Ref(storageRef)) {
    const key = decodeS3Ref(storageRef);
    try {
      const { bucket } = s3Config();
      await getS3Client().send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
      return { ok: true, provider: "s3", resolvedPath: key };
    } catch (e) {
      logStorageDiag("verify_s3_failed", { key, message: e.message });
      return { ok: false, provider: "s3", reason: "file_missing" };
    }
  }

  const candidates = resolveLocalCandidates(storageRef, { profileId, planId, storedName });
  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
        fs.accessSync(candidate, fs.constants.R_OK);
        return { ok: true, provider: "local", resolvedPath: candidate };
      }
    } catch {
      /* try next */
    }
  }
  logStorageDiag("verify_local_failed", { storageRef, candidates });
  return { ok: false, provider: "local", reason: "file_missing", candidates };
}

function resolveLocalCandidates(storageRef, { profileId, planId, storedName } = {}) {
  const ref = String(storageRef || "").trim();
  const out = [];
  if (ref) {
    out.push(path.resolve(ref));
    const idx = ref.replace(/\\/g, "/").indexOf(DEFAULT_PREFIX);
    if (idx >= 0) {
      out.push(path.join(process.cwd(), "tmp", ref.replace(/\\/g, "/").slice(idx)));
    }
  }
  if (profileId && storedName) {
    out.push(path.join(profileWorkspaceDir(profileId), storedName));
  }
  if (profileId && planId && storedName) {
    out.push(path.join(profileWorkspaceDir(profileId), String(planId).toLowerCase(), storedName));
  }
  return [...new Set(out.filter(Boolean))];
}

async function openDocumentStream(storageRef, meta = {}) {
  const verify = await verifyReadable(storageRef, meta);
  if (!verify.ok) {
    if (isS3Enabled() && meta.profileId && meta.storedName) {
      const fallbackKey = buildObjectKey(meta.profileId, meta.planId, meta.storedName);
      const fallbackRef = encodeS3Ref(fallbackKey);
      if (fallbackRef !== storageRef) {
        const fallback = await verifyReadable(fallbackRef, meta);
        if (fallback.ok) {
          logStorageDiag("resolved_s3_fallback", { from: storageRef, to: fallbackRef });
          return openDocumentStream(fallbackRef, meta);
        }
      }
    }
    return { ok: false, reason: verify.reason || "file_missing", verify };
  }

  if (verify.provider === "s3") {
    const { bucket } = s3Config();
    const key = verify.resolvedPath;
    logStorageDiag("stream_s3", { key, docId: meta.docId || null });
    const res = await getS3Client().send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    return { ok: true, provider: "s3", stream: res.Body, resolvedPath: key };
  }

  logStorageDiag("stream_local", { path: verify.resolvedPath, docId: meta.docId || null });
  return { ok: true, provider: "local", stream: fs.createReadStream(verify.resolvedPath), resolvedPath: verify.resolvedPath };
}

async function persistUploadedFile({
  profileId,
  planId,
  storedName,
  tempFilePath,
  mimeType = "",
  sizeBytes = 0,
}) {
  const status = getStorageStatus();
  logStorageDiag("persist_start", {
    provider: status.provider,
    profileId,
    planId,
    storedName,
    tempFilePath,
    sizeBytes,
  });

  if (!tempFilePath || !fs.existsSync(tempFilePath)) {
    logStorageDiag("persist_temp_missing", { tempFilePath });
    return { ok: false, error: "upload_temp_missing" };
  }

  try {
    fs.accessSync(tempFilePath, fs.constants.R_OK);
  } catch (e) {
    logStorageDiag("persist_not_readable", { tempFilePath, message: e.message });
    return { ok: false, error: "upload_not_readable" };
  }

  if (isS3Enabled()) {
    const objectKey = buildObjectKey(profileId, planId, storedName);
    const storageRef = encodeS3Ref(objectKey);
    const { bucket } = s3Config();
    const body = fs.createReadStream(tempFilePath);
    try {
      await getS3Client().send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: objectKey,
          Body: body,
          ContentType: mimeType || "application/octet-stream",
          Metadata: {
            profileId: String(profileId || ""),
            planId: String(planId || ""),
            storedName: String(storedName || ""),
          },
        })
      );
    } catch (e) {
      logStorageDiag("persist_s3_put_failed", { objectKey, message: e.message });
      return { ok: false, error: "s3_upload_failed" };
    }

    const verify = await verifyReadable(storageRef, { profileId, planId, storedName });
    if (!verify.ok) {
      logStorageDiag("persist_s3_verify_failed", { objectKey });
      return { ok: false, error: "integrity_failed" };
    }

    try {
      fs.unlinkSync(tempFilePath);
    } catch {
      /* temp cleanup best-effort */
    }

    logStorageDiag("persist_s3_ok", { objectKey, storageRef });
    return { ok: true, storagePath: storageRef, storedName, provider: "s3" };
  }

  const destDir = profileWorkspaceDir(profileId);
  fs.mkdirSync(destDir, { recursive: true });
  const destPath = path.join(destDir, storedName);
  try {
    if (path.resolve(tempFilePath) !== path.resolve(destPath)) {
      fs.renameSync(tempFilePath, destPath);
    }
  } catch {
    fs.copyFileSync(tempFilePath, destPath);
    try {
      fs.unlinkSync(tempFilePath);
    } catch {
      /* ignore */
    }
  }

  const verify = await verifyReadable(destPath, { profileId, planId, storedName });
  if (!verify.ok) {
    logStorageDiag("persist_local_verify_failed", { destPath });
    return { ok: false, error: "integrity_failed" };
  }

  logStorageDiag("persist_local_ok", { destPath });
  return { ok: true, storagePath: destPath, storedName, provider: "local" };
}

async function removeStoredFile(storageRef, meta = {}) {
  if (isS3Ref(storageRef)) {
    const key = decodeS3Ref(storageRef);
    try {
      const { bucket } = s3Config();
      await getS3Client().send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
      logStorageDiag("remove_s3_ok", { key });
      return { ok: true };
    } catch (e) {
      logStorageDiag("remove_s3_failed", { key, message: e.message });
      return { ok: false, error: e.message };
    }
  }

  const verify = await verifyReadable(storageRef, meta);
  if (verify.ok && verify.resolvedPath) {
    try {
      fs.unlinkSync(verify.resolvedPath);
      logStorageDiag("remove_local_ok", { path: verify.resolvedPath });
    } catch (e) {
      logStorageDiag("remove_local_failed", { path: verify.resolvedPath, message: e.message });
    }
  }
  return { ok: true };
}

const FILE_SYNC_MESSAGE = {
  en: "Your file is being synchronized securely. Please refresh or re-upload if the issue persists.",
  fr: "Votre fichier est en cours de synchronisation securisee. Actualisez ou televersez a nouveau si le probleme persiste.",
};

function fileSyncMessage(lang = "en") {
  return lang === "fr" ? FILE_SYNC_MESSAGE.fr : FILE_SYNC_MESSAGE.en;
}

module.exports = {
  workspaceRoot,
  profileWorkspaceDir,
  buildObjectKey,
  encodeS3Ref,
  isS3Ref,
  isS3Enabled,
  getStorageStatus,
  verifyReadable,
  openDocumentStream,
  persistUploadedFile,
  removeStoredFile,
  fileSyncMessage,
  logStorageDiag,
};
