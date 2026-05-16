/**
 * Resumora + BossMind — Google marketing ecosystem audit (proof-oriented).
 *
 * Does NOT call Search Console, GA4 Admin, Google Ads, Merchant Center, or GBP APIs.
 * Uses: live HTML/DNS fetches, existing SEO visibility audit, optional PageSpeed Insights API.
 */

const { runBossMindSeoAiVisibilityAudit } = require("./bossmind-seo-visibility-audit-lib.js");
const { verifySupportMailDns } = require("../orchestration/resumora-support-mail-dns.js");

function tier(ok, warnCondition) {
  if (ok) return "PASS";
  if (warnCondition) return "WARN";
  return "FAIL";
}

function extractGa4Ids(html) {
  const s = String(html);
  const ids = new Set();
  const m1 = s.match(/gtag\('config',\s*['"](G-[A-Z0-9]+)['"]/gi);
  if (m1) m1.forEach((x) => ids.add(x.match(/G-[A-Z0-9]+/i)[0]));
  const m2 = s.match(/googletagmanager\.com\/gtag\/js\?id=(G-[A-Z0-9]+)/gi);
  if (m2) m2.forEach((x) => {
    const mm = x.match(/G-[A-Z0-9]+/i);
    if (mm) ids.add(mm[0]);
  });
  return [...ids];
}

function extractGtmIds(html) {
  const s = String(html);
  const out = new Set();
  const m = s.match(/GTM-[A-Z0-9]+/gi);
  if (m) m.forEach((x) => out.add(x.toUpperCase()));
  return [...out];
}

function extractGoogleAdsIds(html) {
  const s = String(html);
  const out = new Set();
  const m = s.match(/\bAW-[0-9]+\b/gi);
  if (m) m.forEach((x) => out.add(x.toUpperCase()));
  return [...out];
}

function hasGoogleSiteVerification(html) {
  return /name=["']google-site-verification["']/i.test(String(html));
}

async function fetchText(url, timeoutMs = 20000) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: ac.signal,
      headers: { "user-agent": "ResumoraGoogleEcosystemAudit/1.1 (+https://resumora.net)" },
    });
    const text = await res.text();
    return { ok: res.ok, status: res.status, url: res.url || url, text };
  } catch (e) {
    return { ok: false, status: 0, url, text: "", error: e && e.message ? e.message : String(e) };
  } finally {
    clearTimeout(t);
  }
}

async function runPageSpeed(strategy, pageUrl, apiKey) {
  if (!apiKey) return { skipped: true, reason: "GOOGLE_PAGESPEED_API_KEY unset" };
  const qs = `url=${encodeURIComponent(pageUrl)}&key=${encodeURIComponent(apiKey)}&strategy=${strategy}&category=performance&category=accessibility&category=seo`;
  try {
    const res = await fetch(`https://www.googleapis.com/pagespeedonline/v5/runPagespeed?${qs}`, {
      headers: { "user-agent": "ResumoraGoogleEcosystemAudit/1.1" },
    });
    const json = await res.json();
    if (!res.ok) {
      return { ok: false, status: res.status, error: json.error?.message || res.statusText };
    }
    const cats = json.lighthouseResult?.categories || {};
    const perf = Math.round((cats.performance?.score ?? 0) * 100);
    const a11y = Math.round((cats.accessibility?.score ?? 0) * 100);
    const seo = Math.round((cats.seo?.score ?? 0) * 100);
    return { ok: true, strategy, performance: perf, accessibility: a11y, seo: seo, analyzedUrl: json.id };
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
}

async function neonAnalyticsWebEvents7d() {
  try {
    const neon = require("../shared/neon-memory.js");
    await neon.ensureSharedMemoryInitialized().catch(() => {});
    const sql = neon.getSqlClient();
    if (!sql) return { ok: false, reason: "NEON_DATABASE_URL unset" };
    const rows = await sql`
      SELECT COUNT(*)::int AS c FROM analytics_web_events
      WHERE created_at > NOW() - INTERVAL '7 days'
    `;
    const c = rows?.[0]?.c ?? 0;
    return { ok: true, count7d: c };
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
}

/**
 * @param {{ root: string, origin?: string }} opts
 */
async function runResumoraGoogleEcosystemAudit(opts) {
  const root = opts.root;
  const origin = (opts.origin || process.env.RESUMORA_GOOGLE_AUDIT_ORIGIN || "https://resumora.net").replace(/\/$/, "");
  const domain = (() => {
    try {
      return new URL(origin).hostname.replace(/^www\./, "");
    } catch {
      return "resumora.net";
    }
  })();

  const [seoAudit, homeFetch, emailDns] = await Promise.all([
    runBossMindSeoAiVisibilityAudit({ root, origin }),
    fetchText(`${origin}/`),
    verifySupportMailDns(domain),
  ]);

  const gbpAudit = seoAudit.homepageAudit;

  const html = homeFetch.text || "";
  const ga4Ids = extractGa4Ids(html);
  const gtmIds = extractGtmIds(html);
  const adsIds = extractGoogleAdsIds(html);
  const gscMeta = hasGoogleSiteVerification(html);
  const duplicateTagRisk = gtmIds.length > 0 && ga4Ids.length > 0;

  const apiKey = process.env.GOOGLE_PAGESPEED_API_KEY || "";
  const pageSpeedMobile = await runPageSpeed("mobile", `${origin}/`, apiKey);
  const pageSpeedDesktop = await runPageSpeed("desktop", `${origin}/`, apiKey);

  const neonEvents = await neonAnalyticsWebEvents7d();

  const healthFetch = await fetchText(`${origin}/api/health`, 12000);

  /** @type {Record<string, { status: string, evidence?: object, notes?: string[] }>} */
  const services = {};

  let gscStatus = "FAIL";
  if (gscMeta && seoAudit.robots?.ok && seoAudit.sitemap?.ok) gscStatus = "PASS";
  else if ((seoAudit.robots?.ok && seoAudit.sitemap?.ok) || gscMeta) gscStatus = "WARN";

  services.google_search_console = {
    status: gscStatus,
    evidence: {
      htmlVerificationMetaPresent: gscMeta,
      robotsOk: seoAudit.robots?.ok,
      sitemapFetchOk: seoAudit.sitemap?.ok,
      visibilityScoreProxy: seoAudit.visibilityScore,
    },
    notes: [
      "Dashboard checks (ownership, Coverage, CWV, manual actions, impressions) require https://search.google.com/search-console — not available from this repo.",
      "HTML meta google-site-verification present only proves deploy includes the tag; confirm property in GSC.",
    ],
  };

  services.google_analytics_4 = {
    status: tier(ga4Ids.length > 0, seoAudit.envSignals?.NEXT_PUBLIC_GA_MEASUREMENT_ID),
    evidence: {
      measurementIdsDetectedInHtml: ga4Ids,
      envHasGaIdThisRun: Boolean(process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID),
      duplicateLoaderRisk: seoAudit.seoMetadataRisk?.duplicateGtagLoaderCount > 1,
    },
    notes: [
      "Realtime, conversions, cross-device, and DebugView require GA4 UI or Data API — not probed here.",
      "Neon /api/analytics/track is complementary; it is not GA4.",
    ],
  };

  services.google_tag_manager = {
    status: gtmIds.length > 0 ? (duplicateTagRisk ? "WARN" : "PASS") : "EXTERNAL_REQUIRED",
    evidence: {
      containerIdsInHtml: gtmIds,
      alsoHasDirectGtagGa4: ga4Ids.length > 0,
    },
    notes: [
      "If using GA4 via gtag only, GTM may be unnecessary; dual stacks can double-fire.",
      "Tag Assistant / preview mode validates GTM in-browser — not automated here.",
    ],
  };

  services.google_ads = {
    status: adsIds.length > 0 ? "PASS" : "EXTERNAL_REQUIRED",
    evidence: { conversionIdsInHtml: adsIds },
    notes: [
      "Account health, billing, policy, and delivery require ads.google.com — not available from this repo.",
      "AW- in HTML suggests Ads tags; absence does not mean Ads is off (server-side or off-site).",
    ],
  };

  services.google_business_profile = {
    status: tier(gbpAudit.overallStatus === "pass", gbpAudit.overallStatus === "warn"),
    evidence: {
      overallStatus: gbpAudit.overallStatus,
      httpStatus: gbpAudit.httpStatus,
      checklistSha256: gbpAudit.checklistSha256,
    },
    notes: [
      "Maps verification, review flow, and live Maps pack rank require operator checks + GBP UI.",
      "Run: npm run resumora:gbp:audit — Neon: resumora:gbp:confirm after manual work.",
    ],
  };

  services.google_workspace_email = {
    status: tier(
      emailDns.authenticationSummary?.aggregate === "pass",
      emailDns.authenticationSummary?.aggregate === "warn"
    ),
    evidence: {
      authenticationSummary: emailDns.authenticationSummary,
      spamHeuristic: emailDns.spamHeuristic,
    },
    notes: [
      "Inbox placement and Gmail Postmaster require Google dashboards + seed tests.",
    ],
  };

  services.google_merchant_center = {
    status: "EXTERNAL_REQUIRED",
    evidence: {},
    notes: [
      "No Merchant Center feed is defined in this audit; confirm in merchants.google.com if used.",
    ],
  };

  services.seo_indexing = {
    status: tier(seoAudit.visibilityScore >= 70, seoAudit.visibilityScore >= 50),
    evidence: {
      visibilityScore: seoAudit.visibilityScore,
      issues: seoAudit.issues,
      duplicateCanonicalTags: seoAudit.seoMetadataRisk?.duplicateCanonicalTags,
    },
    notes: ["Indexing and duplicate URL issues: use GSC Coverage + URL Inspection."],
  };

  services.performance_lighthouse_via_pagespeed = {
    status:
      pageSpeedMobile.skipped && pageSpeedDesktop.skipped
        ? "EXTERNAL_REQUIRED"
        : tier(
            (pageSpeedMobile.performance ?? 0) >= 70 && (pageSpeedDesktop.performance ?? 0) >= 70,
            (pageSpeedMobile.performance ?? 0) >= 50 || (pageSpeedDesktop.performance ?? 0) >= 50
          ),
    evidence: { mobile: pageSpeedMobile, desktop: pageSpeedDesktop },
    notes: [
      "Set GOOGLE_PAGESPEED_API_KEY for automated Lighthouse scores (Pagespeed Insights API).",
      "Alternatively run Lighthouse locally or in CI.",
    ],
  };

  services.bossmind_runtime = {
    status: tier(healthFetch.ok, true),
    evidence: {
      healthUrl: `${origin}/api/health`,
      httpStatus: healthFetch.status,
    },
    notes: ["Event consistency across Google vs BossMind requires worker wiring + GSC/GA exports to Neon — partial only."],
  };

  services.neon_analytics_track = {
    status: tier(neonEvents.ok && neonEvents.count7d > 0, neonEvents.ok),
    evidence: neonEvents,
    notes: [
      "Counts BossMind analytics_web_events only — not GA4 hit volume.",
    ],
  };

  const statusScore = (s) => {
    if (s === "PASS") return 1;
    if (s === "WARN") return 0.65;
    if (s === "EXTERNAL_REQUIRED") return 0.35;
    return 0;
  };

  const seoHealthPercent = seoAudit.visibilityScore;
  const emailAuthPercent = emailDns.spamHeuristic?.score ?? 0;

  const trackingKeys = ["google_analytics_4", "google_tag_manager", "google_search_console"];
  let trEarn = 0;
  let trMax = 0;
  for (const k of trackingKeys) {
    trMax += 1;
    trEarn += statusScore(services[k]?.status);
  }
  const trackingHealthPercent = trMax > 0 ? Math.round((trEarn / trMax) * 1000) / 10 : 0;

  const overallKeys = [
    "google_search_console",
    "google_analytics_4",
    "google_tag_manager",
    "google_business_profile",
    "google_workspace_email",
    "seo_indexing",
    "performance_lighthouse_via_pagespeed",
    "bossmind_runtime",
  ];
  let ovEarn = 0;
  let ovMax = 0;
  for (const k of overallKeys) {
    ovMax += 1;
    ovEarn += statusScore(services[k]?.status);
  }
  const overallGoogleEcosystemReadinessPercent = ovMax > 0 ? Math.round((ovEarn / ovMax) * 1000) / 10 : 0;

  return {
    generatedAt: new Date().toISOString(),
    origin,
    domain,
    disclaimer:
      "Proof-based automated slice only. Google Ads, Merchant Center, GSC performance, GA4 realtime, and policy state require authenticated dashboards.",
    liveHtmlSignals: {
      ga4Ids,
      gtmIds,
      googleAdsConversionIds: adsIds,
      googleSiteVerificationMeta: gscMeta,
      duplicateGtagLoaderCount: seoAudit.seoMetadataRisk?.duplicateGtagLoaderCount ?? 0,
      microsoftClarityInDocument: /clarity\.ms/.test(html),
    },
    seoAudit,
    gbpAudit: {
      overallStatus: gbpAudit.overallStatus,
      httpStatus: gbpAudit.httpStatus,
      checks: gbpAudit.checks,
      originFinal: gbpAudit.originFinal,
    },
    emailDns: {
      spf: emailDns.spf,
      dmarc: emailDns.dmarc,
      authenticationSummary: emailDns.authenticationSummary,
      spamHeuristic: emailDns.spamHeuristic,
    },
    services,
    scoring: {
      seoHealthPercent,
      trackingHealthPercent,
      emailAuthPercent,
      neonAnalyticsWebEvents7d: neonEvents.count7d ?? 0,
      overallGoogleEcosystemReadinessPercent,
    },
    warnings: [
      ...(duplicateTagRisk ? ["Both GTM and direct GA4 gtag present — verify you are not double-counting."] : []),
      ...(services.google_analytics_4.status === "FAIL" ? ["No G- measurement ID in live HTML — GA4 may not load for visitors."] : []),
    ],
  };
}

function readLatestGoogleEcosystemReport(repoRoot) {
  const fs = require("fs");
  const path = require("path");
  const dir = path.join(repoRoot, "windows-heal", "reports");
  if (!fs.existsSync(dir)) return null;
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.startsWith("resumora-google-ecosystem-audit-") && f.endsWith(".json"));
  if (!files.length) return null;
  files.sort();
  const last = files[files.length - 1];
  try {
    const j = JSON.parse(fs.readFileSync(path.join(dir, last), "utf8"));
    return {
      file: path.join(dir, last).replace(/\\/g, "/"),
      generatedAt: j.generatedAt,
      scoring: j.scoring,
      services: j.services,
    };
  } catch {
    return { file: path.join(dir, last).replace(/\\/g, "/"), parseError: true };
  }
}

module.exports = {
  runResumoraGoogleEcosystemAudit,
  readLatestGoogleEcosystemReport,
};
