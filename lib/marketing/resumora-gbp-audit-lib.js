/**
 * Resumora Google Business Profile — visibility audit helpers (no Google APIs).
 * Validates public site signals against config/resumora-google-business-profile-checklist.json.
 */

const fs = require("fs");
const crypto = require("crypto");
const path = require("path");

function sha256Hex(s) {
  return crypto.createHash("sha256").update(String(s), "utf8").digest("hex");
}

function loadChecklist(root) {
  const p = path.join(root, "config", "resumora-google-business-profile-checklist.json");
  const raw = fs.readFileSync(p, "utf8");
  return { raw, data: JSON.parse(raw), path: p };
}

function parseHostname(u) {
  try {
    return new URL(u).hostname.toLowerCase();
  } catch {
    return "";
  }
}

/** Apex vs www — same brand host for GBP ↔ site parity checks. */
function sameBrandHost(a, b) {
  const strip = (h) => (h || "").replace(/^www\./, "");
  return strip(a) === strip(b);
}

function extractTitle(html) {
  const m = String(html).match(/<title[^>]*>([^<]*)<\/title>/i);
  return m ? m[1].trim().slice(0, 200) : "";
}

function extractMeta(html, attr, nameOrProp) {
  const re = new RegExp(
    `<meta[^>]+${attr}=["']${nameOrProp}["'][^>]+content=["']([^"']*)["']`,
    "i"
  );
  const m = String(html).match(re);
  if (m) return m[1].trim();
  const re2 = new RegExp(
    `<meta[^>]+content=["']([^"']*)["'][^>]+${attr}=["']${nameOrProp}["']`,
    "i"
  );
  const m2 = String(html).match(re2);
  return m2 ? m2[1].trim() : "";
}

function hasJsonLdSignal(html) {
  const blocks = String(html).match(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
  if (!blocks || !blocks.length) return false;
  const joined = blocks.join("\n").toLowerCase();
  return (
    joined.includes('"@type"') &&
    (joined.includes("organization") ||
      joined.includes("professionalservice") ||
      joined.includes("localbusiness") ||
      joined.includes("website"))
  );
}

function collectPublicSocialHosts() {
  const hosts = new Set();
  const keys = Object.keys(process.env).filter(
    (k) =>
      k.startsWith("NEXT_PUBLIC_SOCIAL_") ||
      k === "NEXT_PUBLIC_ORG_SAME_AS" ||
      k === "NEXT_PUBLIC_LINKEDIN_URL"
  );
  for (const k of keys) {
    const v = process.env[k];
    if (!v || typeof v !== "string") continue;
    for (const part of v.split(/[\s,|]+/).map((s) => s.trim()).filter(Boolean)) {
      if (!/^https?:\/\//i.test(part)) continue;
      const h = parseHostname(part);
      if (h) hosts.add(h);
    }
  }
  return { configuredKeyCount: keys.length, hostnames: [...hosts].sort() };
}

/**
 * @param {{ root: string, origin?: string, timeoutMs?: number }} opts
 */
async function runVisibilityAudit(opts) {
  const root = opts.root;
  const { raw, data: checklist } = loadChecklist(root);
  const checklistSha256 = sha256Hex(raw);
  const canonicalSite = checklist.canonicalSite || "https://resumora.net";
  const expectedHost = parseHostname(canonicalSite);
  const origin =
    (opts.origin || process.env.RESUMORA_GBP_AUDIT_ORIGIN || canonicalSite).replace(/\/$/, "");
  const timeoutMs = opts.timeoutMs ?? 20000;

  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);

  let httpStatus = 0;
  let originFinal = origin;
  let fetchError = "";
  let html = "";

  try {
    const res = await fetch(`${origin}/`, {
      redirect: "follow",
      signal: ac.signal,
      headers: {
        "user-agent": "ResumoraGBPVisibilityAudit/1.0 (+https://resumora.net)",
        accept: "text/html,application/xhtml+xml",
      },
    });
    httpStatus = res.status;
    originFinal = res.url || origin;
    html = await res.text();
  } catch (e) {
    fetchError = e && e.message ? e.message : String(e);
  } finally {
    clearTimeout(t);
  }

  const finalHost = parseHostname(originFinal);
  const lower = html.toLowerCase();
  const title = extractTitle(html);
  const titleHasBrand = /resumora/i.test(title);
  const bodyHasBrand = /resumora/i.test(html);

  const align = checklist.liveSiteAlignment || {};
  const must = Array.isArray(align.homeMustContainInsensitive)
    ? align.homeMustContainInsensitive
    : [];
  const keywordHits = {};
  const keywordMiss = [];
  for (const phrase of must) {
    const p = String(phrase).toLowerCase();
    const ok = lower.includes(p);
    keywordHits[phrase] = ok;
    if (!ok) keywordMiss.push(phrase);
  }

  const ogUrl = extractMeta(html, "property", "og:url");
  const canonicalHref =
    (String(html).match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i) || [])[1] ||
    (String(html).match(/<link[^>]+href=["']([^"']+)["'][^>]+rel=["']canonical["']/i) || [])[1] ||
    "";

  let canonicalHostOk = true;
  const canonIssues = [];
  for (const u of [ogUrl, canonicalHref].filter(Boolean)) {
    const h = parseHostname(u);
    if (h && !sameBrandHost(h, expectedHost)) {
      canonicalHostOk = false;
      canonIssues.push({ url: u.slice(0, 120), host: h, expectedHost });
    }
  }

  const viewportOk = /<meta[^>]+name=["']viewport["']/i.test(html);
  const jsonLdOk = hasJsonLdSignal(html);
  const httpsOk = /^https:\/\//i.test(originFinal);

  const suspicious = Array.isArray(checklist.suspiciousAlternateOrigins)
    ? checklist.suspiciousAlternateOrigins
    : [];
  const conflictHits = [];
  for (const s of suspicious) {
    if (s && lower.includes(String(s).toLowerCase())) conflictHits.push(s);
  }

  const social = collectPublicSocialHosts();

  /** @type {string[]} */
  const missingOptimizationPoints = [];
  /** @type {string[]} */
  const weakVisibilitySignals = [];
  /** @type {string[]} */
  const recommendedRepoActions = [];

  if (fetchError) {
    missingOptimizationPoints.push(`Live origin fetch failed: ${fetchError}`);
    weakVisibilitySignals.push("Public HTML could not be retrieved for alignment checks.");
  }
  if (httpStatus && httpStatus !== 200) {
    weakVisibilitySignals.push(`Homepage HTTP status ${httpStatus} (prefer 200 for crawlers).`);
  }
  if (finalHost && !sameBrandHost(finalHost, expectedHost)) {
    missingOptimizationPoints.push(
      `Final URL host "${finalHost}" differs from checklist canonical host "${expectedHost}".`
    );
    recommendedRepoActions.push(
      "Set NEXT_PUBLIC_SITE_URL to https://resumora.net on production (Render) and redeploy."
    );
  }
  if (keywordMiss.length) {
    missingOptimizationPoints.push(
      `Homepage missing recommended keyword fragments: ${keywordMiss.join(", ")}`
    );
    weakVisibilitySignals.push("Thin keyword alignment vs GBP checklist — enrich visible copy (protected-surface-safe).");
  }
  if (!canonicalHostOk) {
    weakVisibilitySignals.push("Canonical / og:url host mismatch vs resumora.net — fix meta or redirects.");
  }
  if (!viewportOk) {
    weakVisibilitySignals.push("No viewport meta — mobile SERP / usability signal may suffer.");
  }
  if (!jsonLdOk) {
    weakVisibilitySignals.push("No JSON-LD Organization/WebSite block detected — AI + rich result eligibility weaker.");
  }
  if (!social.hostnames.length && social.configuredKeyCount === 0) {
    missingOptimizationPoints.push(
      "No NEXT_PUBLIC_SOCIAL_* / NEXT_PUBLIC_ORG_SAME_AS in env — cross-channel parity with GBP social links unverified locally."
    );
  }

  const profileAttrs = checklist.profileAttributes || {};
  const gbpOperatorTodo = Object.entries(profileAttrs).map(([k, v]) => ({
    key: k,
    recommended: v && v.recommended,
    hint: (v && v.implementationHint) || "",
  }));

  let overallStatus = "pass";
  if (fetchError || (httpStatus && httpStatus !== 200) || !titleHasBrand || !bodyHasBrand) {
    overallStatus = "fail";
  } else if (
    keywordMiss.length ||
    !canonicalHostOk ||
    conflictHits.length ||
    !viewportOk ||
    !jsonLdOk ||
    (finalHost && !sameBrandHost(finalHost, expectedHost))
  ) {
    overallStatus = "warn";
  }

  const brandingConsistency = {
    ok: titleHasBrand && bodyHasBrand && !conflictHits.length,
    issues: /** @type {string[]} */ ([]),
  };
  if (!titleHasBrand) brandingConsistency.issues.push("Title tag should include Resumora.");
  if (!bodyHasBrand) brandingConsistency.issues.push("HTML body should include Resumora branding.");
  if (conflictHits.length) {
    brandingConsistency.issues.push(`Suspicious alternate origin strings in HTML: ${conflictHits.join(", ")}`);
  }

  return {
    generatedAt: new Date().toISOString(),
    checklistVersion: checklist.version ?? 0,
    checklistSha256,
    canonicalSite,
    originRequested: origin,
    originFinal,
    finalHost,
    expectedHost,
    httpStatus,
    fetchError: fetchError || undefined,
    title: title.slice(0, 300),
    checks: {
      https: httpsOk,
      titleHasBrand,
      bodyHasBrand,
      keywordHits,
      canonicalHostOk,
      viewportMobile: viewportOk,
      jsonLdStructuredData: jsonLdOk,
    },
    socialEnvSummary: social,
    gbpOperatorTodo,
    missingOptimizationPoints,
    weakVisibilitySignals,
    recommendedRepoActions,
    brandingConsistency,
    conflictHits,
    overallStatus,
    disclaimer:
      "This audit does not call Google Business Profile APIs or modify Maps. Apply attributes in GBP UI or Business Profile API after OAuth.",
  };
}

module.exports = {
  loadChecklist,
  sha256Hex,
  runVisibilityAudit,
};
