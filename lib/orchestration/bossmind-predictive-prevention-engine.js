/**
 * Pre-build / pre-deploy risk scanner (heuristic, proof-based).
 */
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const { assessRouteOwnership } = require("./bossmind-route-ownership");
const { runErrorMemoryEngine } = require("./bossmind-error-memory-engine");

function loadPredictiveConfig(cwd) {
  try {
    const j = JSON.parse(fs.readFileSync(path.join(cwd, "config/bossmind-production-autonomous.json"), "utf8"));
    return j.predictive || {};
  } catch {
    return {};
  }
}

function scanCssBalance(cwd, rel) {
  const abs = path.join(cwd, rel);
  if (!fs.existsSync(abs)) return { ok: false, reason: "missing" };
  const body = fs.readFileSync(abs, "utf8");
  const open = (body.match(/{/g) || []).length;
  const close = (body.match(/}/g) || []).length;
  return { ok: open === close, open, close };
}

function scanHydrationRisk(cwd) {
  const hits = [];
  const targets = [
    "components/marketing/HomePage.jsx",
    "components/marketing/sections/PricingPanel.jsx",
    "components/marketing/InstallPrompt.jsx",
  ];
  for (const rel of targets) {
    const abs = path.join(cwd, rel);
    if (!fs.existsSync(abs)) continue;
    const body = fs.readFileSync(abs, "utf8");
    if (/typeof window/.test(body) && !body.includes("useEffect")) {
      hits.push(rel);
    }
  }
  return hits;
}

function scanBrokenImports(cwd) {
  const home = path.join(cwd, "components/marketing/HomePage.jsx");
  if (!fs.existsSync(home)) return ["HomePage.jsx missing"];
  const body = fs.readFileSync(home, "utf8");
  const imports = [...body.matchAll(/from ["']@\/([^"']+)["']/g)].map((m) => m[1]);
  const broken = [];
  for (const imp of imports) {
    const candidates = [
      path.join(cwd, imp.replace(/\//g, path.sep)),
      path.join(cwd, imp + ".jsx"),
      path.join(cwd, imp + ".js"),
    ];
    if (!candidates.some((c) => fs.existsSync(c))) broken.push(imp);
  }
  return broken;
}

async function runPredictivePreventionEngine({ cwd = process.cwd(), neonApi, projectKey = "resumora" } = {}) {
  const cfg = loadPredictiveConfig(cwd);
  const threshold = Number(cfg.blockDeployRiskThreshold || 75);
  const requiredEnv = cfg.requireEnv || [];

  let risk = 10;
  const factors = [];
  const checks = [];

  const routeOwn = assessRouteOwnership(cwd);
  if (routeOwn.blockDeploy) {
    risk += 30;
    factors.push("route_ownership_violation");
  }
  checks.push({ id: "route_ownership", pass: !routeOwn.blockDeploy });

  const errMem = await runErrorMemoryEngine({ cwd, neonApi, projectKey });
  if (errMem.matchedPatterns?.length) {
    risk += 15 * errMem.matchedPatterns.length;
    factors.push("error_patterns_detected");
  }
  checks.push({ id: "error_memory_clean", pass: errMem.matchedPatterns.length === 0 });

  const css = scanCssBalance(cwd, "styles/resumora-global.css");
  if (!css.ok) {
    risk += 20;
    factors.push("css_brace_imbalance");
  }
  checks.push({ id: "css_balance", pass: css.ok });

  const hydration = scanHydrationRisk(cwd);
  if (hydration.length) {
    risk += 12;
    factors.push("hydration_risk_heuristic");
  }
  checks.push({ id: "hydration_heuristic", pass: hydration.length === 0 });

  const brokenImports = scanBrokenImports(cwd);
  if (brokenImports.length) {
    risk += 25;
    factors.push("broken_imports");
  }
  checks.push({ id: "imports_resolve", pass: brokenImports.length === 0 });

  const missingEnv = requiredEnv.filter((k) => !process.env[k]);
  if (missingEnv.length) {
    risk += 10;
    factors.push("missing_stripe_env");
  }
  checks.push({ id: "stripe_env_present", pass: missingEnv.length === 0 });

  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(cwd, "package.json"), "utf8"));
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    checks.push({ id: "next_present", pass: Boolean(deps.next) });
    checks.push({ id: "react_present", pass: Boolean(deps.react) });
    if (!deps.next || !deps.react) risk += 20;
  } catch {
    risk += 15;
    checks.push({ id: "package_json", pass: false });
  }

  let gitDirty = false;
  try {
    const status = execSync("git status --porcelain", { cwd, encoding: "utf8" }).trim();
    gitDirty = status.length > 0;
    if (gitDirty && process.env.BOSSMIND_PREDICTIVE_ALLOW_DIRTY !== "1") {
      risk += 8;
      factors.push("uncommitted_changes");
    }
  } catch {
    /* ignore */
  }
  checks.push({ id: "git_state_known", pass: true });

  risk = Math.min(100, Math.max(0, Math.round(risk)));
  const blockDeploy = risk >= threshold;
  const earned = checks.filter((c) => c.pass).length;
  const percent = checks.length ? Math.round((earned / checks.length) * 1000) / 10 : 0;

  return {
    percent,
    riskScore: risk,
    blockDeploy,
    blockDeployEnforced: blockDeploy && process.env.BOSSMIND_PREDICTIVE_BLOCK_DEPLOY === "1",
    factors,
    checks,
    hydrationHits: hydration,
    brokenImports,
    missingEnv,
    routeViolations: routeOwn.violations,
  };
}

module.exports = { runPredictivePreventionEngine };
