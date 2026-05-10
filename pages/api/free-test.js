/**
 * Free Test / demo intake — no Stripe. Persists to Neon free_test_requests + event_log.
 */
const formidable = require("formidable");
const fs = require("fs");
const path = require("path");
const { getSqlClient, initializeSharedMemory, saveEvent } = require("../../lib/shared/neon-memory");
const { normalizeEmail, isAllowedServiceKey } = require("../../lib/marketing/free-test-services");

export const config = {
  api: {
    bodyParser: false,
  },
};

function maskEmail(email) {
  const s = String(email || "");
  const at = s.indexOf("@");
  if (at < 1) return "***";
  return `${s.slice(0, 2)}***${s.slice(at)}`;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  await initializeSharedMemory();
  const sql = getSqlClient();
  if (!sql) {
    return res.status(503).json({
      error: "free_test_requires_neon",
      message: "Configure NEON_DATABASE_URL to submit a Free Test request.",
    });
  }

  const uploadDir = path.join(process.cwd(), "tmp", "uploads");
  fs.mkdirSync(uploadDir, { recursive: true });

  const form = formidable({
    uploadDir,
    keepExtensions: true,
    maxFiles: 1,
    maxFileSize: 10 * 1024 * 1024,
    filename: (_name, _ext, part) => {
      const safeOriginal = (part.originalFilename || "document")
        .replace(/[^a-zA-Z0-9._-]/g, "-")
        .slice(0, 80);
      return `freetest-${Date.now()}-${safeOriginal}`;
    },
  });

  try {
    const [fields, files] = await form.parse(req);
    const email = normalizeEmail(fields.email?.[0]);
    const serviceKey = String(fields.serviceKey?.[0] || "").trim();
    const langRaw = String(fields.lang?.[0] || "en").trim().toLowerCase();
    const lang = langRaw === "fr" ? "fr" : "en";
    const pageCount = Math.min(12, Math.max(1, parseInt(String(fields.pageCount?.[0] || "1"), 10) || 1));
    const notes = String(fields.notes?.[0] || "").slice(0, 2000);
    const requestType =
      String(fields.requestType?.[0] || "free_test_request").slice(0, 64) || "free_test_request";

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: "invalid_email" });
    }
    if (!isAllowedServiceKey(serviceKey)) {
      return res.status(400).json({ error: "invalid_service" });
    }

    const uploaded = files.resumeFile?.[0];
    let uploadOriginalName = null;
    let uploadStoredName = null;
    let uploadSizeBytes = null;
    if (uploaded) {
      uploadOriginalName = uploaded.originalFilename || null;
      uploadStoredName = path.basename(uploaded.filepath || "");
      uploadSizeBytes = uploaded.size || null;
    }

    try {
      await sql(
        `INSERT INTO free_test_requests (
          email, service_key, lang, page_count, notes,
          upload_original_name, upload_stored_name, upload_size_bytes, request_type
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          email,
          serviceKey,
          lang,
          pageCount,
          notes || null,
          uploadOriginalName,
          uploadStoredName,
          uploadSizeBytes,
          requestType === "demo_request" ? "demo_request" : "free_test_request",
        ]
      );
    } catch (e) {
      if (String(e.message || "").includes("duplicate") || String(e.code) === "23505") {
        return res.status(409).json({ error: "one_free_test_per_email" });
      }
      throw e;
    }

    await saveEvent({
      projectKey: process.env.BOSSMIND_PROJECT_KEY || "resumora",
      eventType: "free_test.submitted",
      severity: "info",
      source: "api.free-test",
      eventKey: `free:${email}:${serviceKey}`,
      payload: {
        requestType: requestType === "demo_request" ? "demo_request" : "free_test_request",
        emailMask: maskEmail(email),
        serviceKey,
        lang,
        pageCount,
        hasUpload: Boolean(uploadStoredName),
        uploadSizeBytes,
        conversionStatus: "submitted",
      },
    });

    return res.status(200).json({
      ok: true,
      messageKey: "freeTestSuccess",
    });
  } catch (error) {
    console.error("free-test:", error);
    return res.status(500).json({ error: error.message || "Request failed" });
  }
}
