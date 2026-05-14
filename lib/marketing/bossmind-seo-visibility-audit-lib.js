/**
 * BossMind SEO + AI visibility audit (Resumora in-repo checks + stack manifest).
 * Does not call SE Ranking, NeuronWriter, LowFruits, or Google/Bing authenticated APIs.
 */

const fs = require("fs");
const crypto = require("crypto");
const path = require("path");

function sha256Hex(s) {
  return crypto.createHash("sha256").update(String(s), "utf8").digest("hex");
}

function loadStack(root) {
  const p = path.join(root, "config", "bossmind-seo-ai-visibility-stack.json");
  const raw = fs.readFileSync(p, "utf8");
  return { raw, data: JSON.parse(raw), path: p };
}

async function fetchText(url, timeoutMs = 15000) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: ac.signal,
      headers: { "user-agent": "BossMindSeoVisibilityAudit/1.0" },
    });
    const text = await res.text();
    return { ok: res.ok, status: res.status, url: res.url || url, text };
  } catch (e) {
    return { ok: false, status: 0, url, text: "", error: e && e.message ? e.message : String(e) };
  } finally {
    clearTimeout(t);
  }
}

function countCanonicalTags(html) {
  const s = String(html);
  const a = (s.match(/<link[^>]+rel=["']canonical["']/gi) || []).length;
  return a;
}

function robotsReferencesOrigin(robotsText, expectedHost) {
  const lines = String(robotsText).split(/\r?\n/);
  const sm = lines.filter((l) => /^sitemap:\s*/i.test(l));
  if (!sm.length) return { ok: false, reason: "No Sitemap: directives in robots.txt" };
  const strip = (h) => (h || "").replace(/^www\./, "");
  const bad = [];
  for (const line of sm) {
    const u = line.replace(/^sitemap:\s*/i, "").trim();
    try {
      const host = new URL(u).hostname.toLowerCase();
      if (strip(host) !== strip(expectedHost)) bad.push(u);
    } catch {
      bad.push(u);
    }
  }
  return { ok: !bad.length, bad, sm };
}

function weakSitemapPaths() {
  const { allSitemapEntries } = require("./seo-config");
  try {
    return allSitemapEntries()
      .filter((e) => Number(e.priority) < 0.5)
      .map((e) => e.path)
      .slice(0, 40);
  } catch {
    return [];
  }
}

/**
 * @param {{ root: string, origin?: string }} opts
 */
async function runBossMindSeoAiVisibilityAudit(opts) {
  const root = opts.root;
  const { raw, data: stack } = loadStack(root);
  const stackSha = sha256Hex(raw);

  const gbpAudit = require("./resumora-gbp-audit-lib.js");
  const origin = (opts.origin || process.env.BOSSMIND_SEO_AUDIT_ORIGIN || "https://resumora.net").replace(/\/$/, "");
  const expectedHost = (() => {
    try {
      return new URL(origin).hostname.toLowerCase();
    } catch {
      return "resumora.net";
    }
  })();

  const home = await gbpAudit.runVisibilityAudit({ root, origin });
  const robots = await fetchText(`${origin}/robots.txt`);
  const sitemap = await fetchText(`${origin}/sitemap.xml`);
  const robotsAnalysis = robots.text
    ? robotsReferencesOrigin(robots.text, expectedHost)
    : { ok: false, reason: robots.error || "empty robots" };

  const homeFetch = await fetchText(`${origin}/`);
  const canonicalCount = homeFetch.text ? countCanonicalTags(homeFetch.text) : 0;
  const duplicateCanonicalRisk = canonicalCount > 1;

  const gtagCount = homeFetch.text
    ? (homeFetch.text.match(/googletagmanager\.com\/gtag\/js/gi) || []).length
    : 0;
  const duplicateGtagRisk = gtagCount > 1;

  const envSignals = {
    NEXT_PUBLIC_SITE_URL: Boolean(process.env.NEXT_PUBLIC_SITE_URL),
    NEXT_PUBLIC_GA_MEASUREMENT_ID: Boolean(process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID),
    NEXT_PUBLIC_GSC_VERIFICATION: Boolean(process.env.NEXT_PUBLIC_GSC_VERIFICATION),
    NEXT_PUBLIC_ORG_SAME_AS: Boolean(
      process.env.NEXT_PUBLIC_ORG_SAME_AS || process.env.NEXT_PUBLIC_ORGANIZATION_SAME_AS
    ),
    NEXT_PUBLIC_CLARITY_PROJECT_ID: Boolean(process.env.NEXT_PUBLIC_CLARITY_PROJECT_ID),
    NEXT_PUBLIC_BING_SITE_VERIFICATION: Boolean(process.env.NEXT_PUBLIC_BING_SITE_VERIFICATION),
  };

  const weights = {
    home: 22,
    robots: 12,
    sitemap: 15,
    jsonLd: 12,
    canonicalMeta: 10,
    viewport: 8,
    envBundle: 11,
    duplicateRisk: 10,
  };

  function w(name, ok) {
    return ok ? weights[name] : 0;
  }

  const homeOk =
    home.overallStatus !== "fail" &&
    home.checks &&
    home.checks.titleHasBrand &&
    home.checks.bodyHasBrand &&
    home.httpStatus === 200;

  const scoreRaw =
    w("home", homeOk) +
    w("robots", robots.ok && robotsAnalysis.ok) +
    w("sitemap", sitemap.ok && /urlset/i.test(sitemap.text)) +
    w("jsonLd", !!(home.checks && home.checks.jsonLdStructuredData)) +
    w("canonicalMeta", !!(home.checks && home.checks.canonicalHostOk) && !duplicateCanonicalRisk) +
    w("viewport", !!(home.checks && home.checks.viewportMobile)) +
    w(
      "envBundle",
      envSignals.NEXT_PUBLIC_GA_MEASUREMENT_ID &&
        envSignals.NEXT_PUBLIC_GSC_VERIFICATION &&
        envSignals.NEXT_PUBLIC_ORG_SAME_AS
    ) +
    w("duplicateRisk", !duplicateGtagRisk && !duplicateCanonicalRisk);

  const maxScore = Object.values(weights).reduce((a, b) => a + b, 0);
  const visibilityScore = Math.round((scoreRaw / maxScore) * 100);

  const issues = [];
  if (!homeOk) issues.push("Homepage visibility / branding checks failed or non-200.");
  if (!robots.ok) issues.push(`robots.txt fetch: HTTP ${robots.status} ${robots.error || ""}`.trim());
  else if (!robotsAnalysis.ok) issues.push(`robots.txt sitemap alignment: ${robotsAnalysis.reason || robotsAnalysis.bad?.join(", ")}`);
  if (!sitemap.ok) issues.push(`sitemap.xml fetch: HTTP ${sitemap.status}`);
  else if (!/urlset/i.test(sitemap.text)) issues.push("sitemap.xml does not look like a valid urlset.");
  if (duplicateCanonicalRisk) issues.push("Multiple canonical link tags detected on homepage HTML.");
  if (duplicateGtagRisk) issues.push("Multiple gtag.js loads detected — risk of duplicate GA hits.");
  if (!envSignals.NEXT_PUBLIC_GA_MEASUREMENT_ID) issues.push("NEXT_PUBLIC_GA_MEASUREMENT_ID not set in this environment (GA4 snippet will not load in dev).");
  if (!envSignals.NEXT_PUBLIC_GSC_VERIFICATION) issues.push("NEXT_PUBLIC_GSC_VERIFICATION not set (GSC HTML tag verification will not emit).");
  if (!envSignals.NEXT_PUBLIC_ORG_SAME_AS) issues.push("NEXT_PUBLIC_ORG_SAME_AS not set (JSON-LD sameAs may be empty).");

  const externalPlatformsPending = [
    "SE Ranking: connect properties + schedule audits (API key in Railway only).",
    "NeuronWriter / LowFruits: keyword exports → human-reviewed content PRs (no auto page rewrites here).",
    "GSC / Bing Webmaster: domain verification + sitemap submit in each dashboard.",
    "GA4 + Clarity: confirm data collection after NEXT_PUBLIC_* ids are set on Render.",
  ];

  const multiProject = (stack.projects || []).map((p) => ({
    id: p.id,
    inRepo: !!p.inRepo,
    canonicalSite: p.canonicalSite || null,
    note: p.inRepo ? "Audited above." : "Out of repo — run same audit pattern in sibling repo after deploy.",
  }));

  return {
    generatedAt: new Date().toISOString(),
    stackVersion: stack.version,
    stackSha256: stackSha,
    origin,
    visibilityScore,
    scoreBreakdown: { earned: scoreRaw, max: maxScore },
    homepageAudit: home,
    robots: { status: robots.status, ok: robots.ok, sitemapAlignment: robotsAnalysis },
    sitemap: { status: sitemap.status, ok: sitemap.ok },
    seoMetadataRisk: { duplicateCanonicalTags: canonicalCount, duplicateGtagLoaderCount: gtagCount },
    envSignals,
    issues,
    weakAuthorityPaths: weakSitemapPaths(),
    keywordOpportunityThemes: stack.keywordOpportunityThemes || [],
    externalPlatformsPending,
    multiProject,
    antiLeak: stack.antiLeak,
    disclaimer:
      "No live connection to SE Ranking, NeuronWriter, LowFruits, or authenticated Google/Bing APIs from this script.",
  };
}

module.exports = {
  loadStack,
  sha256Hex,
  runBossMindSeoAiVisibilityAudit,
};
