const fs = require("fs");
const path = require("path");
const {
  initializeSharedMemory,
  getRuntimeAuthority,
  listRecentEvents,
  listRecentTaskStates,
} = require("../../../lib/shared/neon-memory");

function authorize(req) {
  const dev = process.env.NODE_ENV === "development";
  const diag = process.env.BOSSMIND_DIAGNOSTICS === "1";
  const secret = process.env.BOSSMIND_ORCHESTRATION_SECRET;
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  return dev || diag || (Boolean(secret) && token === secret);
}

function readLocalStatus() {
  const p = path.join(process.cwd(), ".bossmind", "runtime-sync", "status.json");
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return null;
  }
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (!authorize(req)) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const projectKey = process.env.BOSSMIND_PROJECT_KEY || "resumora";
  const authorityKey = process.env.BOSSMIND_AUTHORITY_KEY || "luxury_ui_baseline";
  const local = readLocalStatus();

  try {
    const init = await initializeSharedMemory();
    const neonEnabled = Boolean(init?.enabled);
    const authority = neonEnabled
      ? await getRuntimeAuthority({ projectKey, authorityKey })
      : null;
    const [events, tasks] = neonEnabled
      ? await Promise.all([
          listRecentEvents({ projectKey, limit: 10 }),
          listRecentTaskStates({ projectKey, limit: 10 }),
        ])
      : [[], []];
    return res.status(200).json({
      ok: true,
      projectKey,
      authorityKey,
      ts: Date.now(),
      neonEnabled,
      authority,
      localStatus: local,
      recentEvents: events,
      recentTasks: tasks,
    });
  } catch (error) {
    return res.status(500).json({
      error: error.message || "runtime sync status failed",
      projectKey,
      authorityKey,
      localStatus: local,
    });
  }
}

