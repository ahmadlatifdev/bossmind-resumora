/**
 * Authorization for BossMind AI Video orchestration APIs.
 */
function bearer(req) {
  const auth = req.headers.authorization || "";
  return auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
}

function authorizeAdmin(req) {
  const dev = process.env.NODE_ENV === "development";
  const diag = process.env.BOSSMIND_DIAGNOSTICS === "1";
  if (dev || diag) return true;
  const t = bearer(req);
  const vid = process.env.BOSSMIND_AI_VIDEO_ADMIN_SECRET;
  const orch = process.env.BOSSMIND_ORCHESTRATION_SECRET;
  if (vid && t === vid) return true;
  if (orch && t === orch) return true;
  return false;
}

function authorizeN8n(req) {
  const t = bearer(req);
  const n = process.env.BOSSMIND_AI_VIDEO_N8N_SECRET;
  return Boolean(n && t === n);
}

module.exports = { authorizeAdmin, authorizeN8n, bearer };
