const fs = require("fs");
const path = require("path");
const {
  getSqlClient,
  saveRollbackSnapshot,
  upsertTaskState,
} = require("./neon-memory");

async function lockFile({
  projectKey,
  filePath,
  taskKey = `lock:${filePath}`,
  agent = "bossmind-agent",
}) {
  const sql = getSqlClient();
  if (!sql) return { locked: false, reason: "NEON_DATABASE_URL is missing" };

  const lockKey = `${projectKey}:${filePath}`;
  const existing = await sql(
    `SELECT assigned_agent FROM task_state
     WHERE project_key = $1 AND task_key = $2 AND status = 'locked'
     LIMIT 1`,
    [projectKey, taskKey]
  );

  if (existing.length > 0) {
    return {
      locked: false,
      reason: `File already locked by ${existing[0].assigned_agent || "another agent"}`,
    };
  }

  await upsertTaskState({
    projectKey,
    taskKey,
    status: "locked",
    assignedAgent: agent,
    payload: { filePath, lockKey },
  });

  return { locked: true, lockKey };
}

async function unlockFile({
  projectKey,
  filePath,
  taskKey = `lock:${filePath}`,
  agent = "bossmind-agent",
}) {
  await upsertTaskState({
    projectKey,
    taskKey,
    status: "idle",
    assignedAgent: agent,
    payload: { filePath },
  });
  return { unlocked: true };
}

async function snapshotBeforeEdit({
  projectKey,
  relativeFilePath,
  reason = "pre-edit snapshot",
}) {
  const absolutePath = path.isAbsolute(relativeFilePath)
    ? relativeFilePath
    : path.join(/*turbopackIgnore: true*/ process.cwd(), relativeFilePath);

  if (!fs.existsSync(absolutePath)) {
    return { snapped: false, reason: "file not found" };
  }

  const snapshotBody = fs.readFileSync(absolutePath, "utf8");
  await saveRollbackSnapshot({
    projectKey,
    filePath: absolutePath,
    snapshotBody,
    reason,
  });
  return { snapped: true, filePath: absolutePath };
}

module.exports = {
  lockFile,
  snapshotBeforeEdit,
  unlockFile,
};
