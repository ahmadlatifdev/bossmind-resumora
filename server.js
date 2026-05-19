const { loadProjectEnv } = require("./lib/shared/load-project-env");
const { bootstrapProductionRuntime } = require("./lib/shared/production-runtime-bootstrap");
loadProjectEnv();
bootstrapProductionRuntime();

const path = require("path");
const { spawn } = require("child_process");
const express = require("express");
const next = require("next");
const {
  initializeSharedMemory,
  saveEvent,
  probeDatabaseConnection,
} = require("./lib/shared/neon-memory");
const { indexScreenshots } = require("./lib/shared/screenshot-indexer");

const dev = process.env.NODE_ENV !== "production";
const app = next({ dev });
const handle = app.getRequestHandler();
const port = parseInt(process.env.PORT || "3000", 10);
const PROJECT_KEY = process.env.BOSSMIND_PROJECT_KEY || "resumora";
const REFERENCE_IMAGES_FOLDER =
  process.env.BOSSMIND_REFERENCE_IMAGES_FOLDER ||
  "D:\\Shakhsy11\\bossmind-resumora-base\\reference-images";

app
  .prepare()
  .then(async () => {
    const memoryInit = await initializeSharedMemory();
    if (memoryInit.enabled) {
      try {
        await saveEvent({
          projectKey: PROJECT_KEY,
          source: "server.start",
          eventType: "shared.memory.ready",
          payload: { port, dev },
        });
      } catch (e) {
        console.warn(`[resumora-runtime] startup event log skipped: ${e.message}`);
      }
      try {
        const screenshotResult = await indexScreenshots({
          projectKey: PROJECT_KEY,
          sourceFolder: REFERENCE_IMAGES_FOLDER,
        });
        await saveEvent({
          projectKey: PROJECT_KEY,
          source: "server.start",
          eventType: "screenshot.indexing.completed",
          payload: screenshotResult,
        });
      } catch (e) {
        console.warn(`[resumora-runtime] screenshot indexing skipped: ${e.message}`);
      }
      console.log("Shared Neon memory active.");
    } else {
      console.warn(`Shared memory disabled: ${memoryInit.reason}`);
    }

    const server = express();

    server.use(express.json({ limit: "10mb" }));
    server.use(express.urlencoded({ extended: true }));

    server.get("/health", async (_req, res) => {
      const database = await probeDatabaseConnection();
      const ok = database.ok;
      res.status(ok ? 200 : 503).json({ ok, service: "resumora", database });
    });

    server.all("*splat", (req, res) => handle(req, res));

    server.listen(port, (err) => {
      if (err) throw err;
      console.log(`Resumora running on port ${port}`);
      if (process.env.BOSSMIND_MARKETING_ACTIVATE_ON_SERVER_START === "1") {
        const script = path.join(__dirname, "scripts", "bossmind-marketing-activation.mjs");
        const child = spawn(process.execPath, [script], {
          cwd: __dirname,
          detached: true,
          stdio: "ignore",
          env: process.env,
        });
        child.unref();
        console.log("BossMind marketing activation forked (BOSSMIND_MARKETING_ACTIVATE_ON_SERVER_START=1).");
      }
    });
  })
  .catch((err) => {
    console.error("Failed to start server", err);
    process.exit(1);
  });
