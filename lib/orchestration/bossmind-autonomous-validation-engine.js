/**
 * Post-deploy production validation — DOM, pricing, logo, EN/FR, links, layout (proof-based).
 */
const fs = require("fs");
const path = require("path");

async function fetchHtml(url) {
  const res = await fetch(url, {
    headers: { "cache-control": "no-cache", "user-agent": "BossMind-Validation/2.0" },
  });
  return { ok: res.ok, status: res.status, html: await res.text() };
}

function extractLinks(html, origin) {
  const links = new Set();
  const re = /href="(\/[^"#?]*)"/g;
  let m;
  while ((m = re.exec(html))) links.add(m[1]);
  return [...links].slice(0, 12);
}

function loadValidationConfig(cwd) {
  try {
    return JSON.parse(fs.readFileSync(path.join(cwd, "config/bossmind-production-autonomous.json"), "utf8"))
      .validation;
  } catch {
    return {};
  }
}

async function runAutonomousValidationEngine({
  cwd = process.cwd(),
  origin = "https://resumora.net",
} = {}) {
  const cfg = loadValidationConfig(cwd);
  const paths = cfg.paths || ["/", "/pricing"];
  const marker = cfg.pricingUiMarker || 'data-rs-pricing-ui="20260517-lux-v4"';
  const order = cfg.pricingOrder || ["basic", "professional", "elite", "essential_advanced"];
  const forbidden = cfg.forbiddenPatterns || [];
  const logoPath = cfg.logoPath || "/brand/resumora-logo-official.jpg";

  const checks = [];
  const routeReports = {};

  for (const p of paths) {
    const url = `${origin.replace(/\/$/, "")}${p}`;
    let probe = { ok: false, html: "" };
    try {
      probe = await fetchHtml(url);
    } catch (e) {
      probe.error = e.message;
    }
    const html = probe.html || "";
    const tiers = [];
    const re = /data-tier="([^"]+)"/g;
    let m;
    while ((m = re.exec(html))) tiers.push(m[1]);
    const pricingTiers = tiers.filter((t) => order.includes(t));
    const eaLast = pricingTiers[pricingTiers.length - 1] === "essential_advanced";
    const forbiddenHits = forbidden.filter((pat) => html.includes(pat));

    if (p === "/") routeReports._homeHtml = html;
    routeReports[p] = {
      status: probe.status,
      ok: probe.ok,
      hasMarker: html.includes(marker),
      tierCount: pricingTiers.length,
      essentialAdvancedFarRight: eaLast,
      hasLogo: html.includes(logoPath) || html.includes("resumora-logo"),
      hasLangSwitch: html.includes("EN") && (html.includes("FR") || html.includes("fr")),
      hasPricingCta: html.includes("Select Plan") || html.includes("selectPlan") || html.includes("rs-price-btn"),
      forbiddenHits,
      viewportMeta: html.includes('name="viewport"'),
    };

    checks.push({ id: `route_${p}_200`, pass: probe.ok && probe.status === 200 });
    checks.push({ id: `route_${p}_marker`, pass: html.includes(marker) });
    checks.push({ id: `route_${p}_no_forbidden`, pass: forbiddenHits.length === 0 });
    if (p === "/" || p === "/pricing") {
      checks.push({ id: `route_${p}_four_tiers`, pass: pricingTiers.length >= 4 });
      checks.push({ id: `route_${p}_ea_right`, pass: eaLast });
      checks.push({ id: `route_${p}_logo`, pass: routeReports[p].hasLogo });
    }
  }

  const siteCopy = fs.readFileSync(path.join(cwd, "lib/marketing/site-copy.js"), "utf8");
  const enFrSync =
    siteCopy.includes('en: {') &&
    siteCopy.includes('fr: {') &&
    siteCopy.includes("essentialAdvancedTagline");
  checks.push({ id: "site_copy_en_fr", pass: enFrSync });

  let brokenLinks = 0;
  const homeHtml = routeReports._homeHtml || "";
  if (homeHtml) {
    const originBase = origin.replace(/\/$/, "");
    for (const link of extractLinks(homeHtml, originBase)) {
      try {
        const r = await fetch(`${originBase}${link}`, {
          method: "HEAD",
          headers: { "user-agent": "BossMind-Validation/2.0" },
        });
        if (!r.ok) brokenLinks += 1;
      } catch {
        brokenLinks += 1;
      }
    }
  }
  checks.push({ id: "internal_links_ok", pass: brokenLinks === 0, brokenCount: brokenLinks });

  let seoOk = false;
  try {
    const r = await fetchHtml(`${origin.replace(/\/$/, "")}/robots.txt`);
    seoOk = r.ok && r.html.includes("Sitemap");
  } catch {
    seoOk = false;
  }
  checks.push({ id: "robots_sitemap", pass: seoOk });

  const screenshotHook = Boolean(process.env.BOSSMIND_SCREENSHOT_HOOK_URL);
  checks.push({
    id: "screenshot_hook_or_structural",
    pass: screenshotHook || checks.filter((c) => c.id.startsWith("route_/") && c.pass).length >= 4,
  });

  const earned = checks.filter((c) => c.pass).length;
  const percent = checks.length ? Math.round((earned / checks.length) * 1000) / 10 : 0;

  const report = {
    generatedAt: new Date().toISOString(),
    origin,
    percent,
    checks,
    routeReports,
    blockDeploy: percent < 70,
  };

  const outDir = path.join(cwd, ".bossmind", "validation");
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "latest-post-deploy.json"), JSON.stringify(report, null, 2), "utf8");

  return report;
}

module.exports = { runAutonomousValidationEngine };
