/**
 * Protected luxury UI authority — structural invariants & scoring (no JSX parse).
 */

const fs = require("fs");
const path = require("path");

const DEFAULT_MANIFEST_REL = ["config", "bossmind-protected-ui-authority.json"];

function loadManifest(cwd = process.cwd()) {
  const p = path.join(cwd, ...DEFAULT_MANIFEST_REL);
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return null;
  }
}

function findDuplicateHomePageComponents(cwd) {
  /** @type {string[]} */
  const hits = [];
  const walk = (dir, depth = 0) => {
    if (depth > 8) return;
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.name === "node_modules" || e.name === ".git" || e.name === ".next") continue;
      const abs = path.join(dir, e.name);
      if (e.isDirectory()) walk(abs, depth + 1);
      else if (/HomePage\.jsx$/.test(e.name) && fs.existsSync(abs)) {
        hits.push(path.relative(cwd, abs).replace(/\\/g, "/"));
      }
    }
  };
  walk(path.join(cwd, "components"), 0);
  return hits;
}

function assertIndexBootstrapsCanonicalHome(cwd, manifest) {
  const canonical = manifest?.canonicalRoutes?.homePageSource || "components/marketing/HomePage.jsx";
  const aliasPath = `@/${canonical.replace(/\.jsx?$/, "").replace(/^components\//, "components/")}`;
  const idx = path.join(cwd, "pages", "index.js");
  if (!fs.existsSync(idx)) {
    return { ok: false, reason: "missing pages/index.js" };
  }
  const body = fs.readFileSync(idx, "utf8");
  const importsCanonical =
    body.includes(`"${canonical}"`) ||
    body.includes(`'${canonical}'`) ||
    body.includes(`"@/components/marketing/HomePage"`) ||
    body.includes(`'@/components/marketing/HomePage'`) ||
    body.includes(aliasPath);
  const wrong =
    /\bminimal\b/i.test(body) ||
    /pricing-only|MinimalHome/i.test(body) ||
    (/HomePage/i.test(body) && !importsCanonical);
  return { ok: importsCanonical && !wrong, canonical, idx: "pages/index.js" };
}

function appRouterOverridesPages(cwd) {
  const appRoot = path.join(cwd, "app");
  if (!fs.existsSync(appRoot)) return { conflicts: [], ok: true };
  const conflicts = [];
  const pageFiles = [];
  const walk = (dir) => {
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const abs = path.join(dir, e.name);
      if (e.isDirectory()) walk(abs);
      else if (e.name === "page.tsx" || e.name === "page.js" || e.name === "page.jsx") pageFiles.push(abs);
    }
  };
  walk(appRoot);
  return { conflicts: pageFiles.map((p) => path.relative(cwd, p).replace(/\\/g, "/")), ok: pageFiles.length === 0 };
}

function structuralAuthorityReport(cwd = process.cwd()) {
  const manifest = loadManifest(cwd);
  const dupes = findDuplicateHomePageComponents(cwd);
  const indexCheck = manifest ? assertIndexBootstrapsCanonicalHome(cwd, manifest) : { ok: false };
  const app = appRouterOverridesPages(cwd);

  const duplicateHomeSources = dupes.length > 1;
  const singleHomeAuthority = dupes.length === 1 && dupes[0] === (manifest?.canonicalRoutes?.homePageSource || "");

  return {
    manifestLoaded: Boolean(manifest),
    duplicateHomePageFiles: dupes,
    duplicateHomeSources,
    singleHomeAuthority,
    indexBootstrapsCanonical: indexCheck.ok === true && indexCheck.reason === undefined ? true : !!indexCheck.ok,
    indexReport: indexCheck,
    appRouterConflicts: app.conflicts,
    appRouterOk: app.ok,
    ok:
      Boolean(manifest) &&
      dupes.length === 1 &&
      dupes[0] === "components/marketing/HomePage.jsx" &&
      !!indexCheck.ok &&
      app.ok,
  };
}

function readBuildIdIfAny(cwd) {
  try {
    const bid = path.join(cwd, ".next", "BUILD_ID");
    if (fs.existsSync(bid)) return fs.readFileSync(bid, "utf8").trim();
  } catch {
    /* ignore */
  }
  return null;
}

/**
 * Aggregate 0–100 scores for observability dashboards.
 */
function computeAutonomyScores({
  probeOk,
  neonEnabled,
  authorityHashMatches,
  structuralOk,
  hasAuthority,
  healSucceeded,
} = {}) {
  const clamp = (n) => Math.max(0, Math.min(100, Math.round(n)));

  const routeAuthority = probeOk ? 100 : healSucceeded ? 72 : 22;
  const structuralLock = structuralOk ? 100 : 18;
  const memoryAlign =
    !neonEnabled ? 78 : authorityHashMatches && hasAuthority ? 100 : hasAuthority ? 55 : 28;
  const healBonus = healSucceeded && probeOk ? 4 : 0;

  const synchronization = clamp(
    probeOk
      ? 96 + (structuralOk ? 2 : 0) + healBonus
      : healSucceeded
        ? 58
        : 28 + (structuralOk ? 10 : 0)
  );
  const enforcement = clamp(
    routeAuthority * 0.34 + structuralLock * 0.33 + memoryAlign * 0.33
  );
  const deploymentIntegrity =
    readBuildIdIfAny(process.cwd()) && probeOk ? 94 : readBuildIdIfAny(process.cwd()) ? 70 : probeOk ? 55 : 28;
  const driftShield = clamp(
    (probeOk ? 42 : 8) + (structuralOk ? 32 : 4) + (authorityHashMatches || !neonEnabled ? 24 : 6)
  );

  return {
    runtimeSynchronizationScore: clamp(synchronization),
    autonomousEnforcementScore: clamp(enforcement),
    deploymentIntegrityScore: clamp(deploymentIntegrity),
    driftProtectionScore: clamp(driftShield),
    routeAuthorityScore: clamp(routeAuthority),
    memoryAuthorityScore: clamp(memoryAlign),
    protectedBaselineLockScore: clamp(structuralLock),
    compositeAutonomyScore: clamp(enforcement),
  };
}

module.exports = {
  loadManifest,
  structuralAuthorityReport,
  computeAutonomyScores,
  findDuplicateHomePageComponents,
  assertIndexBootstrapsCanonicalHome,
  appRouterOverridesPages,
  readBuildIdIfAny,
};
