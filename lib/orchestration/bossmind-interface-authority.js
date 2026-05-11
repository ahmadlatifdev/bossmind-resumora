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
 * Optional: reconcileScore / probeUnreachable reconcile partial credit when dev server is down but memory structure aligned.
 */
function computeAutonomyScores({
  probeOk,
  neonEnabled,
  authorityHashMatches,
  structuralOk,
  hasAuthority,
  healSucceeded,
  reconcileScore,
  probeUnreachable,
} = {}) {
  const clamp = (n) => Math.max(0, Math.min(100, Math.round(n)));
  const rec = reconcileScore !== undefined ? clamp(reconcileScore) : probeOk ? 96 : probeUnreachable ? 72 : 40;

  const routeAuthority =
    probeOk ? 100 : probeUnreachable && structuralOk && (authorityHashMatches || !neonEnabled) ? 78 : healSucceeded ? 72 : 22;
  const structuralLock = structuralOk ? 100 : 18;
  const memoryAlign =
    !neonEnabled ? 78 : authorityHashMatches && hasAuthority ? 100 : hasAuthority ? 55 : 28;
  const healBonus = healSucceeded && probeOk ? 4 : probeUnreachable && healSucceeded ? 2 : 0;

  const synchronization = clamp(
    probeOk
      ? 94 + rec * 0.06 + (structuralOk ? 2 : 0) + healBonus
      : probeUnreachable && structuralOk
        ? 72 + Math.min(rec, 92) * 0.26
        : healSucceeded
          ? 58 + rec * 0.08
          : 28 + (structuralOk ? 10 : 0) + rec * 0.06
  );
  const enforcement = clamp(
    routeAuthority * 0.28 + structuralLock * 0.28 + memoryAlign * 0.28 + rec * 0.16
  );
  const deploymentIntegrity =
    readBuildIdIfAny(process.cwd()) && probeOk
      ? 94
      : readBuildIdIfAny(process.cwd())
        ? probeUnreachable
          ? clamp(74 + rec * 0.24)
          : 70
        : probeOk
          ? 55
          : probeUnreachable
            ? clamp(48 + rec * 0.3)
            : 28;
  const driftShield = clamp(
    (probeOk ? 42 : probeUnreachable ? 28 : 8) +
      (structuralOk ? 32 : 4) +
      (authorityHashMatches || !neonEnabled ? 24 : 6) +
      rec * 0.06
  );

  const composite = clamp(enforcement * 0.72 + Math.min(rec, syncCapForComposite(probeOk, probeUnreachable)) * 0.28);

  return {
    runtimeSynchronizationScore: clamp(synchronization),
    autonomousEnforcementScore: clamp(enforcement),
    productionReconciliationScore: clamp(rec),
    deploymentIntegrityScore: clamp(deploymentIntegrity),
    driftProtectionScore: clamp(driftShield),
    routeAuthorityScore: clamp(routeAuthority),
    memoryAuthorityScore: clamp(memoryAlign),
    protectedBaselineLockScore: clamp(structuralLock),
    compositeAutonomyScore: composite,
    enterpriseOrchestrationScore: clamp((composite + clamp(rec)) / 2 + (probeOk && structuralOk ? 8 : probeUnreachable ? 4 : 0)),
  };
}

function syncCapForComposite(probeOk, probeUnreachable) {
  if (probeOk) return 100;
  if (probeUnreachable) return 92;
  return 88;
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
