/**
 * Deployment verification — live HTML/DOM/route probes (proof-based).
 */
const fs = require("fs");
const path = require("path");

async function fetchHtml(url) {
  const res = await fetch(url, {
    headers: {
      "cache-control": "no-cache",
      pragma: "no-cache",
      "user-agent": "BossMind-DeployVerify/1.0",
    },
  });
  return { status: res.status, html: await res.text(), ok: res.ok };
}

function loadRequiredMarkers(cwd) {
  try {
    const auth = JSON.parse(
      fs.readFileSync(path.join(cwd, "config/bossmind-protected-ui-authority.json"), "utf8")
    );
    return {
      homeRequired: auth.requiredHomeHtmlMarkers || [],
      pricingRequired: auth.requiredPricingHtmlMarkers || [
        'data-rs-pricing-ui="20260517-lux-v4"',
        "rs-pricing-grid--final",
        "/brand/resumora-logo-official.png",
        "data-rs-brand-logo=\"1\"",
      ],
      homeForbidden: auth.forbiddenLiveHtmlPatterns || [],
      pricingForbidden: auth.forbiddenPricingHtmlPatterns || [],
    };
  } catch {
    return {
      homeRequired: [],
      pricingRequired: [],
      homeForbidden: [],
      pricingForbidden: [],
    };
  }
}

function markersForPath(routePath, markerSets) {
  if (routePath === "/pricing") {
    return {
      required: markerSets.pricingRequired,
      forbidden: [...markerSets.homeForbidden, ...markerSets.pricingForbidden],
    };
  }
  return {
    required: markerSets.homeRequired,
    forbidden: markerSets.homeForbidden,
  };
}

function satisfiesBrandMarker(html, marker) {
  if (marker.includes("resumora-logo") || marker.includes("data-rs-brand-logo")) {
    return (
      html.includes("/brand/resumora-logo-official") ||
      html.includes("/brand/resumora-logo-original") ||
      html.includes('data-rs-brand-logo="1"') ||
      (html.includes("resumora-logo.png") && !html.includes("resumora-logo.svg"))
    );
  }
  return html.includes(marker);
}

function extractTierOrder(html) {
  const tiers = [];
  const re = /data-tier="([^"]+)"/g;
  let m;
  while ((m = re.exec(html))) tiers.push(m[1]);
  return tiers;
}

async function runDeploymentVerification({
  cwd = process.cwd(),
  origin = "https://resumora.net",
  paths = ["/", "/pricing"],
} = {}) {
  const markerSets = loadRequiredMarkers(cwd);
  const routeResults = {};
  const checks = [];

  for (const p of paths) {
    const url = `${origin.replace(/\/$/, "")}${p}`;
    let probe = { url, status: 0, ok: false, html: "" };
    try {
      probe = await fetchHtml(url);
    } catch (e) {
      probe.error = e.message || String(e);
    }
    const html = probe.html || "";
    const { required, forbidden } = markersForPath(p, markerSets);
    const forbiddenHits = forbidden.filter((pat) => html.includes(pat));
    const requiredMissing = required.filter((pat) => {
      const needle = pat.replace(/\\"/g, '"');
      return !satisfiesBrandMarker(html, needle);
    });
    const tiers = extractTierOrder(html);
    const pricingTiers = tiers.filter((t) =>
      ["basic", "professional", "elite", "essential_advanced"].includes(t)
    );
    const eaFarRight =
      pricingTiers.length >= 4 && pricingTiers[pricingTiers.length - 1] === "essential_advanced";

    routeResults[p] = {
      status: probe.status,
      ok: probe.ok,
      forbiddenHits,
      requiredMissing,
      tierCount: pricingTiers.length,
      tierSequence: pricingTiers,
      essentialAdvancedFarRight: eaFarRight,
      error: probe.error || null,
    };

    checks.push({ id: `route_${p}_ok`, pass: probe.ok && probe.status === 200 });
    checks.push({ id: `route_${p}_no_forbidden`, pass: forbiddenHits.length === 0 });
    checks.push({ id: `route_${p}_markers`, pass: requiredMissing.length === 0 });
    if (p === "/" || p === "/pricing") {
      checks.push({ id: `route_${p}_four_tiers`, pass: pricingTiers.length >= 4 });
      checks.push({ id: `route_${p}_ea_far_right`, pass: eaFarRight });
    }
  }

  let apiHealthOk = false;
  try {
    const r = await fetch(`${origin.replace(/\/$/, "")}/api/health`, {
      headers: { "user-agent": "BossMind-DeployVerify/1.0" },
    });
    apiHealthOk = r.ok;
    checks.push({ id: "api_health", pass: r.ok });
  } catch {
    checks.push({ id: "api_health", pass: false });
  }

  const earned = checks.filter((c) => c.pass).length;
  const percent = checks.length ? Math.round((earned / checks.length) * 1000) / 10 : 0;

  return {
    percent,
    checks,
    routeResults,
    apiHealthOk,
    origin,
    blockDeploy: percent < 70,
  };
}

module.exports = { runDeploymentVerification, extractTierOrder };
