const {
  lockFile,
  snapshotBeforeEdit,
  unlockFile,
} = require("../../../lib/shared/file-guard");
const { initializeSharedMemory } = require("../../../lib/shared/neon-memory");

const PROJECT_KEY = process.env.BOSSMIND_PROJECT_KEY || "resumora";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const init = await initializeSharedMemory();
  if (!init.enabled) {
    return res.status(503).json({
      error: "Shared memory is not enabled",
      details: init.reason,
    });
  }

  const { action, filePath, taskKey, agent, reason } = req.body || {};
  if (!action || !filePath) {
    return res.status(400).json({ error: "action and filePath are required" });
  }

  if (action === "lock") {
    const result = await lockFile({
      projectKey: PROJECT_KEY,
      filePath,
      taskKey,
      agent,
    });
    return res.status(200).json({ ok: true, result });
  }

  if (action === "unlock") {
    const result = await unlockFile({
      projectKey: PROJECT_KEY,
      filePath,
      taskKey,
      agent,
    });
    return res.status(200).json({ ok: true, result });
  }

  if (action === "snapshot") {
    const result = await snapshotBeforeEdit({
      projectKey: PROJECT_KEY,
      relativeFilePath: filePath,
      reason: reason || "manual snapshot",
    });
    return res.status(200).json({ ok: true, result });
  }

  return res.status(400).json({ error: `Unsupported action: ${action}` });
}
