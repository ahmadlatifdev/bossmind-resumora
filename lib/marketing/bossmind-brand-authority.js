/**
 * BossMind brand naming authority — Resumora official; blocks legacy variants.
 */
const fs = require("fs");
const path = require("path");

const DEFAULT_CONFIG_PATH = "config/bossmind-brand-authority.json";

function loadBrandAuthority(cwd = process.cwd()) {
  const p = path.join(cwd, DEFAULT_CONFIG_PATH);
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function buildForbiddenRegexes(config) {
  return (config.forbiddenVariants || []).map((v) => ({
    id: v.id,
    re: new RegExp(v.pattern, v.flags || "gi"),
  }));
}

function findBrandViolations(text, config = loadBrandAuthority()) {
  const src = String(text || "");
  const hits = [];
  for (const { id, re } of buildForbiddenRegexes(config)) {
    if (re.test(src)) {
      re.lastIndex = 0;
      const m = src.match(re);
      hits.push({ id, match: m?.[0] || id });
    }
  }
  return hits;
}

function normalizeBrandText(text, config = loadBrandAuthority()) {
  let out = String(text || "");
  for (const rule of config.textReplacements || []) {
    const re = new RegExp(rule.from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
    out = out.replace(re, rule.to);
  }
  if (/^Resume:\s*/i.test(out) && !/^Resumora:/i.test(out)) {
    out = out.replace(/^Resume:\s*/i, `${config.officialBrand}: `);
  }
  return out;
}

function officialPlanStripeName(planId, config = loadBrandAuthority()) {
  const constants = require("./bossmind-brand-authority.constants");
  return config.planStripeNames?.[planId] || constants.officialPlanStripeName(planId);
}

function resolveOfficialProductName(productName, config = loadBrandAuthority()) {
  const normalized = normalizeBrandText(productName, config);
  const lower = normalized.toLowerCase();
  for (const entry of config.catalogProducts || []) {
    if ((entry.match || []).some((m) => lower.includes(String(m).toLowerCase()))) {
      return entry.name;
    }
  }
  if (findBrandViolations(normalized, config).length === 0 && /^Resumora:/i.test(normalized)) {
    return normalized;
  }
  return normalizeBrandText(
    normalized.startsWith(config.officialBrand) ? normalized : `${config.officialBrand}: ${normalized}`,
    config
  );
}

function matchCatalogForPlan(planId, config = loadBrandAuthority()) {
  return officialPlanStripeName(planId, config);
}

function checkoutMetadata({ planId, planName, planPrice, utm = {} }, config = loadBrandAuthority()) {
  const official = matchCatalogForPlan(planId, config);
  const slice = (v) => String(v ?? "").slice(0, 500);
  return {
    brand_name: slice(config.officialBrand),
    official_product_name: slice(official),
    plan_id: slice(planId),
    plan_name: slice(normalizeBrandText(planName || official, config)),
    plan_price: slice(planPrice),
    billing_mode: slice("payment_one_time"),
    utm_source: slice(utm.utm_source),
    utm_medium: slice(utm.utm_medium),
    utm_campaign: slice(utm.utm_campaign),
  };
}

const SCAN_ALLOWLIST = [
  "config/bossmind-brand-authority.json",
  "config/bossmind-baseline-snapshots/bossmind-brand-authority-v1/bossmind-brand-authority.json",
  "scripts/bossmind-brand-authority-lock.mjs",
  "lib/marketing/bossmind-brand-authority.js",
];

function scanFileContent(filePath, content, config) {
  const rel = filePath.replace(/\\/g, "/");
  if (SCAN_ALLOWLIST.some((a) => rel.endsWith(a))) return null;
  const violations = findBrandViolations(content, config);
  if (!violations.length) return null;
  return { file: rel, violations };
}

function scanDirectory(cwd, relDirs, config) {
  const issues = [];
  for (const rel of relDirs) {
    const root = path.join(cwd, rel);
    if (!fs.existsSync(root)) continue;
    const walk = (dir) => {
      let entries;
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const ent of entries) {
        const full = path.join(dir, ent.name);
        if (ent.isDirectory()) {
          if (ent.name === "node_modules" || ent.name.startsWith(".")) continue;
          walk(full);
          continue;
        }
        const relPath = path.relative(cwd, full).replace(/\\/g, "/");
        if (relPath.includes("bossmind-baseline-snapshots")) continue;
        if (!/\.(js|jsx|ts|tsx|json|md|mjs)$/i.test(ent.name)) continue;
        let content;
        try {
          content = fs.readFileSync(full, "utf8");
        } catch {
          continue;
        }
        const hit = scanFileContent(relPath, content, config);
        if (hit) issues.push(hit);
      }
    };
    walk(root);
  }
  return issues;
}

module.exports = {
  loadBrandAuthority,
  findBrandViolations,
  normalizeBrandText,
  officialPlanStripeName,
  resolveOfficialProductName,
  matchCatalogForPlan,
  checkoutMetadata,
  scanDirectory,
};
