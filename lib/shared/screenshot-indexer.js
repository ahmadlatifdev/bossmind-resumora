const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { getSqlClient, saveEvent } = require("./neon-memory");

const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp"]);

function sha256File(filePath) {
  const buffer = fs.readFileSync(filePath);
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function listScreenshotFiles(sourceFolder) {
  if (!fs.existsSync(sourceFolder)) {
    return [];
  }
  const entries = fs.readdirSync(sourceFolder, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(sourceFolder, entry.name);
    if (entry.isDirectory()) {
      files.push(...listScreenshotFiles(fullPath));
      continue;
    }
    const extension = path.extname(entry.name).toLowerCase();
    if (IMAGE_EXTENSIONS.has(extension)) {
      files.push(fullPath);
    }
  }
  return files;
}

async function indexScreenshots({
  projectKey,
  sourceFolder = "D:\\Shakhsy11\\bossmind-resumora-base\\reference-images",
}) {
  const sql = getSqlClient();
  if (!sql) {
    return { indexed: 0, skipped: 0, reason: "NEON_DATABASE_URL is missing" };
  }

  const files = listScreenshotFiles(sourceFolder);
  let indexed = 0;
  let skipped = 0;

  for (const filePath of files) {
    const hash = sha256File(filePath);
    const metadata = {
      fileName: path.basename(filePath),
      extension: path.extname(filePath).toLowerCase(),
      size: fs.statSync(filePath).size,
    };

    const existing = await sql(
      `SELECT id, file_hash FROM screenshot_analysis_log
       WHERE file_path = $1 OR file_hash = $2
       LIMIT 1`,
      [filePath, hash]
    );

    if (existing.length > 0) {
      skipped += 1;
      continue;
    }

    await sql(
      `INSERT INTO screenshot_analysis_log (
        project_key, source_folder, file_path, file_hash, analyzed, metadata
      ) VALUES ($1, $2, $3, $4, FALSE, $5)`,
      [projectKey, sourceFolder, filePath, hash, metadata]
    );
    indexed += 1;
  }

  await saveEvent({
    projectKey,
    eventType: "screenshots.indexed",
    source: "screenshot-indexer",
    payload: { sourceFolder, indexed, skipped, total: files.length },
  });

  return { indexed, skipped, total: files.length };
}

async function getScreenshotContext({ projectKey, limit = 20 }) {
  const sql = getSqlClient();
  if (!sql) return [];
  return sql(
    `SELECT file_path, analyzed, analysis_summary, metadata, updated_at
     FROM screenshot_analysis_log
     WHERE project_key = $1
     ORDER BY updated_at DESC
     LIMIT $2`,
    [projectKey, limit]
  );
}

module.exports = {
  getScreenshotContext,
  indexScreenshots,
  listScreenshotFiles,
};
