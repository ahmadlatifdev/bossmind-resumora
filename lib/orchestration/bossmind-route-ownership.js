/**
 * Active route + component ownership enforcement (anti partial-contamination).
 */
const fs = require("fs");
const path = require("path");

function loadRegistry(cwd) {
  try {
    return JSON.parse(fs.readFileSync(path.join(cwd, "config/bossmind-route-ownership.json"), "utf8"));
  } catch {
    return {};
  }
}

function assessRouteOwnership(cwd = process.cwd()) {
  const reg = loadRegistry(cwd);
  const checks = [];
  const violations = [];

  const homeBootstrap = path.join(cwd, reg.canonicalHome?.bootstrap || "pages/index.js");
  const homeComponent = path.join(cwd, reg.canonicalHome?.component || "components/marketing/HomePage.jsx");
  checks.push({ id: "home_bootstrap_exists", pass: fs.existsSync(homeBootstrap) });
  checks.push({ id: "home_component_exists", pass: fs.existsSync(homeComponent) });

  if (fs.existsSync(homeComponent)) {
    const body = fs.readFileSync(homeComponent, "utf8");
    const mountsTrust = body.includes("TrustMetricsPanel");
    checks.push({ id: "home_no_trust_mount", pass: !mountsTrust });
    if (mountsTrust) violations.push("HomePage imports TrustMetricsPanel");
  }

  const pricingPanel = path.join(cwd, reg.pricing?.section || "components/marketing/sections/PricingPanel.jsx");
  if (fs.existsSync(pricingPanel)) {
    const body = fs.readFileSync(pricingPanel, "utf8");
    const marker = reg.activePricingMarker || 'data-rs-pricing-ui="20260517-lux-v4"';
    checks.push({ id: "pricing_marker_locked", pass: body.includes(marker) });
    if (!body.includes(marker)) violations.push("PricingPanel missing active marker");
  }

  for (const rel of reg.forbiddenDuplicateComponents || []) {
    const abs = path.join(cwd, rel);
    if (!fs.existsSync(abs)) continue;
    const body = fs.readFileSync(abs, "utf8");
    const isNoOp = body.includes("return null");
    checks.push({ id: `forbidden_active_${rel}`, pass: isNoOp });
    if (!isNoOp) violations.push(`${rel} is not a no-op stub`);
  }

  const earned = checks.filter((c) => c.pass).length;
  return {
    percent: checks.length ? Math.round((earned / checks.length) * 1000) / 10 : 0,
    checks,
    violations,
    blockDeploy: violations.length > 0,
  };
}

module.exports = { assessRouteOwnership, loadRegistry };
