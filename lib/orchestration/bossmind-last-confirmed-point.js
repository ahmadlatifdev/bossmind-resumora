const fs = require("fs");
const path = require("path");

const LOCAL_FILE = path.join(process.cwd(), ".bossmind", "continuity", "last-confirmed-point.json");

function readLocalCheckpoint() {
  try {
    if (!fs.existsSync(LOCAL_FILE)) return null;
    return JSON.parse(fs.readFileSync(LOCAL_FILE, "utf8"));
  } catch {
    return null;
  }
}

function writeLocalCheckpoint(payload) {
  try {
    fs.mkdirSync(path.dirname(LOCAL_FILE), { recursive: true });
    fs.writeFileSync(LOCAL_FILE, JSON.stringify(payload, null, 2), "utf8");
  } catch {
    /* ignore */
  }
}

async function loadContinuePoint({
  neon,
  projectKey,
  checkpointKey = "global_continuity",
} = {}) {
  let memory = null;
  try {
    memory = await neon.getLastConfirmedCheckpoint({ projectKey, checkpointKey });
  } catch {
    memory = null;
  }
  const local = readLocalCheckpoint();
  if (!memory && !local) return null;
  if (memory && !local) return { source: "neon", checkpoint: memory };
  if (!memory && local) return { source: "local", checkpoint: local };

  const memTs = Date.parse(memory.updated_at || memory.created_at || 0) || 0;
  const localTs = Date.parse(local.updatedAt || local.createdAt || 0) || 0;
  if (memTs >= localTs) return { source: "neon", checkpoint: memory };
  return { source: "local", checkpoint: local };
}

async function saveContinuePoint({
  neon,
  projectKey,
  checkpointKey = "global_continuity",
  commitHash = "",
  baselineHash = "",
  payload = {},
  source = "bossmind-runtime",
} = {}) {
  const record = {
    projectKey,
    checkpointKey,
    commitHash,
    baselineHash,
    payload,
    source,
    locked: true,
    updatedAt: new Date().toISOString(),
  };
  try {
    await neon.upsertLastConfirmedCheckpoint({
      projectKey,
      checkpointKey,
      commitHash,
      baselineHash,
      payload,
      source,
      locked: true,
    });
  } catch {
    /* ignore */
  }
  writeLocalCheckpoint(record);
  return record;
}

module.exports = {
  loadContinuePoint,
  saveContinuePoint,
  readLocalCheckpoint,
  writeLocalCheckpoint,
};

