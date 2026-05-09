const {
  getScreenshotContext,
  indexScreenshots,
} = require("../../../lib/shared/screenshot-indexer");
const { initializeSharedMemory } = require("../../../lib/shared/neon-memory");

const PROJECT_KEY = process.env.BOSSMIND_PROJECT_KEY || "resumora";
const REFERENCE_IMAGES_FOLDER =
  process.env.BOSSMIND_REFERENCE_IMAGES_FOLDER ||
  "D:\\Shakhsy11\\bossmind-resumora-base\\reference-images";

export default async function handler(req, res) {
  const init = await initializeSharedMemory();
  if (!init.enabled) {
    return res.status(503).json({
      error: "Shared memory is not enabled",
      details: init.reason,
    });
  }

  if (req.method === "POST") {
    const result = await indexScreenshots({
      projectKey: PROJECT_KEY,
      sourceFolder: REFERENCE_IMAGES_FOLDER,
    });
    return res.status(200).json({ ok: true, result });
  }

  if (req.method === "GET") {
    const rows = await getScreenshotContext({ projectKey: PROJECT_KEY });
    return res.status(200).json({
      ok: true,
      sourceFolder: REFERENCE_IMAGES_FOLDER,
      screenshots: rows,
    });
  }

  return res.status(405).json({ error: "Method not allowed" });
}
