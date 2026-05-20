require("../../../lib/shared/ensure-project-env");
const fs = require("fs");
const path = require("path");
const { readEngagementActor } = require("../../../lib/engagement/http-context");
const { ensureEngagementSchema, getSqlClient } = require("../../../lib/shared/neon-memory");

function contentTypeFor(name = "") {
  const lower = name.toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".docx")) return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (lower.endsWith(".doc")) return "application/msword";
  if (lower.endsWith(".txt") || lower.endsWith(".md")) return "text/plain; charset=utf-8";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  return "application/octet-stream";
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const actor = await readEngagementActor(req, res);
  if (!actor.profileId) return res.status(401).json({ error: "sign_in_required" });
  const id = Number(req.query.id || 0);
  const mode = String(req.query.mode || "download");
  if (!id) return res.status(400).json({ error: "id required" });
  await ensureEngagementSchema();
  const sql = getSqlClient();
  if (!sql) return res.status(503).json({ error: "database_unavailable" });
  const rows = await sql.query(
    `SELECT id, original_name, storage_path, mime_type
     FROM client_workspace_documents
     WHERE id = $1::bigint AND profile_id = $2::uuid AND removed_at IS NULL
     LIMIT 1`,
    [id, actor.profileId]
  );
  const doc = rows?.[0];
  if (!doc) return res.status(404).json({ error: "not_found" });
  const fullPath = path.resolve(doc.storage_path);
  if (!fs.existsSync(fullPath)) return res.status(404).json({ error: "file_missing" });
  const name = String(doc.original_name || "file");
  const contentType = doc.mime_type || contentTypeFor(name);
  res.setHeader("Content-Type", contentType);
  res.setHeader("Cache-Control", "private, no-store");
  if (mode !== "preview") {
    res.setHeader("Content-Disposition", `attachment; filename="${name.replace(/"/g, "")}"`);
  }
  const stream = fs.createReadStream(fullPath);
  stream.pipe(res);
}
