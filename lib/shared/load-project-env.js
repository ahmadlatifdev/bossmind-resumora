const fs = require("fs");
const path = require("path");

/** @typedef {{ loadedFiles: string[] }} LoadProjectEnvResult */

/**
 * Parse KEY=VALUE lines (POSIX-ish). Does not override existing process.env entries.
 */
function parseEnvContent(content) {
  const out = {};
  const lines = String(content).split(/\r?\n/);
  for (let line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const withoutExport = trimmed.startsWith("export ") ? trimmed.slice(7).trim() : trimmed;
    const eq = withoutExport.indexOf("=");
    if (eq < 1) continue;
    const key = withoutExport.slice(0, eq).trim();
    let val = withoutExport.slice(eq + 1).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

/**
 * Load `.env.local` then `.env` from cwd into process.env (non-destructive vs existing shell env).
 * @param {string} [cwd]
 * @returns {LoadProjectEnvResult}
 */
function loadProjectEnv(cwd = process.cwd()) {
  const loadedFiles = [];
  for (const name of [".env.local", ".env"]) {
    const p = path.join(cwd, name);
    if (!fs.existsSync(p)) continue;
    try {
      const parsed = parseEnvContent(fs.readFileSync(p, "utf8"));
      for (const [k, v] of Object.entries(parsed)) {
        if (process.env[k] === undefined) process.env[k] = v;
      }
      loadedFiles.push(name);
    } catch {
      /* ignore unreadable files */
    }
  }
  return { loadedFiles };
}

module.exports = { loadProjectEnv, parseEnvContent };
