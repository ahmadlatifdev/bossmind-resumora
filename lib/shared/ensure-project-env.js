/**
 * Load .env.local / .env once per process (non-destructive vs existing process.env).
 * Import at the top of API routes so local dev and custom server behave consistently.
 */
const { loadProjectEnv } = require("./load-project-env");
const { syncDatabaseEnvAliases } = require("./database-url");

let loaded = false;

function ensureProjectEnv() {
  if (loaded) return;
  loadProjectEnv();
  syncDatabaseEnvAliases();
  loaded = true;
}

ensureProjectEnv();

module.exports = { ensureProjectEnv };
