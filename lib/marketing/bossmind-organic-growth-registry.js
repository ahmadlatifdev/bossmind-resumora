const fs = require("fs");
const path = require("path");

const DEFAULT_NAME = "bossmind-organic-growth-registry.json";

function loadOrganicGrowthRegistry(cwd = process.cwd()) {
  const p = path.join(path.resolve(cwd), "config", DEFAULT_NAME);
  try {
    const raw = fs.readFileSync(p, "utf8");
    return JSON.parse(raw);
  } catch {
    return { version: 0, projects: [], protection: {}, googleCloud: {} };
  }
}

/** @returns {{ id: string, root: string, def: object }[]} */
function listRunnableProjectRoots(registry, env = process.env, projectRoot = process.cwd()) {
  const base = path.resolve(projectRoot);
  const out = [];
  for (const def of registry.projects || []) {
    const primaryKey = def.repoRootEnv;
    const legacyKey = def.legacyRepoRootEnv;
    const primary =
      primaryKey && typeof env[primaryKey] === "string" ? env[primaryKey].trim() : "";
    const legacy =
      !primary && legacyKey && typeof env[legacyKey] === "string" ? env[legacyKey].trim() : "";
    const rootFromEnv = primary || legacy;
    if (rootFromEnv) {
      out.push({ id: def.id, root: path.resolve(rootFromEnv), def });
      continue;
    }
    if (def.id === "resumora" && def.pipelines?.googleOrganicBundle !== false) {
      out.push({ id: def.id, root: base, def });
    }
  }
  return out;
}

module.exports = { loadOrganicGrowthRegistry, listRunnableProjectRoots };
