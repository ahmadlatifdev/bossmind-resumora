/**
 * Cross-project memory bridge — resolves registry projects to on-disk roots + Neon context.
 */
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

function readJsonSafe(p) {
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return null;
  }
}

function resolveProjectRoot(project, hubRoot) {
  const envKey = project.repoRootEnv || `BOSSMIND_REPO_ROOT_${String(project.id).toUpperCase().replace(/-/g, "_")}`;
  const legacyKey = project.legacyRepoRootEnv;
  const fromEnv = process.env[envKey] || (legacyKey && process.env[legacyKey]);
  if (fromEnv && fs.existsSync(fromEnv)) return fromEnv;
  const guess = path.join(hubRoot, project.id);
  if (fs.existsSync(guess)) return guess;
  if (project.id === "resumora") return hubRoot;
  return null;
}

function gitHead(root) {
  try {
    return execSync("git rev-parse --short HEAD", { cwd: root, encoding: "utf8" }).trim();
  } catch {
    return null;
  }
}

async function buildCrossProjectMemory({ cwd = process.cwd(), neonApi, registryRel } = {}) {
  const registryPath = path.join(
    /* turbopackIgnore: true */ cwd,
    registryRel || "config/bossmind-organic-growth-registry.json"
  );
  const registry = readJsonSafe(registryPath) || { projects: [] };
  const hubRoot = process.env.BOSSMIND_BOSSMIND_ROOT || path.dirname(cwd);

  const projects = [];
  for (const p of registry.projects || []) {
    const root = resolveProjectRoot(p, hubRoot);
    let stackSummary = null;
    if (p.stackConfig) {
      try {
        const stack = readJsonSafe(path.join(/* turbopackIgnore: true */ cwd, p.stackConfig));
        stackSummary = stack
          ? { version: stack.version, positioning: stack.positioning?.summary || null }
          : null;
      } catch {
        stackSummary = null;
      }
    }
    const entry = {
      id: p.id,
      displayName: p.displayName,
      siteUrl: p.siteUrl || null,
      repoRoot: root,
      repoPresent: Boolean(root && fs.existsSync(path.join(root, "package.json"))),
      gitHead: root ? gitHead(root) : null,
      pipelines: p.pipelines || {},
      dashboardPath: p.bossmindDashboardPath || null,
      stackConfig: p.stackConfig || null,
      stackSummary,
    };
    projects.push(entry);
  }

  let neonEvents = [];
  if (neonApi?.enabled && neonApi.listRecentEvents) {
    try {
      neonEvents = await neonApi.listRecentEvents({
        projectKey: process.env.BOSSMIND_PROJECT_KEY || "resumora",
        limit: 15,
      });
    } catch {
      neonEvents = [];
    }
  }

  const presentCount = projects.filter((p) => p.repoPresent).length;
  const patternRegistry = readJsonSafe(path.join(cwd, "config/bossmind-error-pattern-registry.json"));
  const patternCount = patternRegistry?.patterns?.length ?? 0;
  const checks = [
    { id: "registry_loaded", pass: (registry.projects || []).length >= 5 },
    { id: "primary_resumora_present", pass: projects.some((p) => p.id === "resumora" && p.repoPresent) },
    { id: "multi_project_roots_resolved", pass: presentCount >= 1 },
    { id: "neon_recent_events", pass: !neonApi?.enabled || neonEvents.length > 0 },
    { id: "error_pattern_registry", pass: patternCount >= 3 },
    { id: "intelligence_sharing_config", pass: fs.existsSync(path.join(cwd, "config/bossmind-production-autonomous.json")) },
  ];
  const earned = checks.filter((c) => c.pass).length;
  const percent = Math.round((earned / checks.length) * 1000) / 10;

  return {
    percent,
    checks,
    projects,
    presentCount,
    totalRegistered: (registry.projects || []).length,
    neonRecentEventCount: neonEvents.length,
    reusablePatterns: patternCount,
    contextInjection: {
      resumora: projects.find((p) => p.id === "resumora") || null,
      elegancyart: projects.find((p) => p.id === "elegancyart") || null,
      bossmindCapital: projects.find((p) => p.id === "bossmind-capital") || null,
      vibeVoyage: projects.find((p) => p.id === "ai-video-generator") || null,
      tiktokAi: projects.find((p) => p.id === "tiktok-ai") || null,
    },
  };
}

module.exports = { buildCrossProjectMemory, resolveProjectRoot };
