#!/usr/bin/env node
/**
 * BossMind global marketing + production confirmation — evidence aggregation only.
 * Does not activate Google/Social APIs, run live payments, or assert worldwide reach without probes.
 *
 *   npm run bossmind:global:production-confirm
 *   BOSSMIND_CONFIRM_STRICT=1 — exit 1 if Stripe financial pipeline or critical artifacts fail
 *   BOSSMIND_CONFIRM_PROBE_SITEMAP=1 — optional HTTP GET of {NEXT_PUBLIC_SITE_URL}/sitemap.xml (evidence only)
 */
import { spawnSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

function loadEnv() {
  try {
    require(path.join(root, "lib/shared/load-project-env.js")).loadProjectEnv(root);
  } catch {
    /* ignore */
  }
}

function runJsonScript(rel) {
  const r = spawnSync(process.execPath, [path.join(root, rel)], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 4 * 1024 * 1024,
  });
  const out = (r.stdout || "").trim();
  let json = null;
  try {
    json = JSON.parse(out);
  } catch {
    json = { parseError: true, raw: out.slice(0, 500), exitCode: r.status ?? 1 };
  }
  return { ok: (r.status ?? 1) === 0, code: r.status ?? 1, json };
}

function runShellOk(cmd) {
  const r = spawnSync(cmd, { cwd: root, shell: true, encoding: "utf8", stdio: "pipe" });
  return { ok: (r.status ?? 1) === 0, code: r.status ?? 1 };
}

function seoArtifactsOk() {
  const fs = require("fs");
  const paths = [
    "lib/marketing/seo-config.js",
    "lib/marketing/traffic-discovery-hints.js",
    "pages/sitemap.xml.js",
    "pages/robots.txt.js",
    "pages/api/marketing/public-engagement.js",
    "pages/api/marketing/traffic-discovery.js",
    "pages/api/marketing/trust-snapshot.js",
  ];
  const missing = paths.filter((p) => !fs.existsSync(path.join(root, p)));
  return { ok: missing.length === 0, missing };
}

async function probePublicSitemap(originRaw) {
  const origin = String(originRaw || "").replace(/\/$/, "");
  if (!/^https:\/\//i.test(origin)) {
    return { ok: false, error: "invalid_origin", url: `${origin}/sitemap.xml` };
  }
  const url = `${origin}/sitemap.xml`;
  const ac = new AbortController();
  const tid = setTimeout(() => ac.abort(), 12000);
  try {
    const r = await fetch(url, { signal: ac.signal, redirect: "follow" });
    const text = await r.text();
    const hasUrlset = /<urlset[\s>]/i.test(text);
    clearTimeout(tid);
    return { ok: r.ok && hasUrlset, status: r.status, url, hasUrlset };
  } catch (e) {
    clearTimeout(tid);
    return {
      ok: false,
      url,
      error: e.name === "AbortError" ? "timeout" : e.message || String(e),
    };
  }
}

async function neonPing() {
  try {
    const neon = require(path.join(root, "lib/shared/neon-memory.js"));
    const init = await neon.initializeSharedMemory();
    return { enabled: init.enabled, reason: init.reason || "" };
  } catch (e) {
    return { enabled: false, reason: e.message || String(e) };
  }
}

async function main() {
  loadEnv();
  const strict = process.env.BOSSMIND_CONFIRM_STRICT === "1";

  const hosting = runShellOk("node scripts/bossmind-hosting-guard.mjs");
  const stripe = runJsonScript("scripts/bossmind-stripe-production-report.mjs");
  const coverage = runJsonScript("scripts/bossmind-enterprise-coverage-report.mjs");
  const envelope = runShellOk("node scripts/bossmind-enterprise-envelope.mjs --dry-run");

  let organic = { skipped: true, reason: "set BOSSMIND_CONFIRM_RUN_ORGANIC=1 to run" };
  if (process.env.BOSSMIND_CONFIRM_RUN_ORGANIC === "1") {
    const r = spawnSync(process.execPath, [path.join(root, "scripts/marketing/bossmind-google-organic-orchestrator.mjs")], {
      cwd: root,
      encoding: "utf8",
      stdio: "pipe",
      maxBuffer: 8 * 1024 * 1024,
    });
    let j = null;
    try {
      j = JSON.parse((r.stdout || "").trim());
    } catch {
      j = null;
    }
    organic = { ok: (r.status ?? 1) === 0, code: r.status ?? 1, summary: j };
  }

  const seo = seoArtifactsOk();
  const neon = await neonPing();

  let sitemapProbe = {
    skipped: true,
    reason: "set BOSSMIND_CONFIRM_PROBE_SITEMAP=1 to fetch public /sitemap.xml (Render origin)",
  };
  if (process.env.BOSSMIND_CONFIRM_PROBE_SITEMAP === "1") {
    const { getSiteUrl } = require(path.join(root, "lib/marketing/seo-config.js"));
    sitemapProbe = await probePublicSitemap(getSiteUrl());
  }

  const stripeReady = Boolean(stripe.json?.audit?.financialPipelineReady);
  const artifactsOk = Boolean(coverage.json?.allCriticalArtifactsPresent);

  const blockers = [];
  if (!hosting.ok) blockers.push("hosting_guard_failed");
  if (!stripeReady) blockers.push("stripe_financial_pipeline_not_ready");
  if (!artifactsOk) blockers.push("missing_critical_artifacts");
  if (!envelope.ok) blockers.push("enterprise_envelope_dry_run_failed");
  if (!seo.ok) blockers.push(`seo_artifacts_missing:${seo.missing.join(",")}`);
  if (strict && blockers.length) {
    /* strict only enforces core pipeline + artifacts */
  }

  const summary = {
    ts: new Date().toISOString(),
    ok:
      hosting.ok &&
      envelope.ok &&
      seo.ok &&
      artifactsOk &&
      (!strict || stripeReady),
    strict,
    checks: {
      hostingGuard: hosting,
      stripeReport: { exitCode: stripe.code, financialPipelineReady: stripeReady, blockers: stripe.json?.blockers },
      enterpriseCoverage: {
        exitCode: coverage.code,
        allCriticalArtifactsPresent: artifactsOk,
        neonEnabled: coverage.json?.neon?.enabled,
      },
      enterpriseEnvelopeDryRun: envelope,
      seoArtifacts: seo,
      neon: neon,
      organicOrchestrator: organic,
      sitemapProbe,
    },
    cannotAutoConfirmFromRepo: [
      "Google Search Console property verified and sitemap submitted (Dashboard)",
      "Instagram/Facebook/LinkedIn/Pinterest/TikTok webhooks and live posts (secrets + platform)",
      "Live payment with real cards (Stripe test then live)",
      "Global latency/SSL from every region (external probes)",
      "YouTube uploads and GBP posts",
    ],
    documentation: [
      "docs/STRIPE_PRODUCTION_VALIDATION.md",
      "docs/BOSSMIND_GOOGLE_ORGANIC_GROWTH_ARCHITECTURE.md",
      "docs/BOSSMIND_ENTERPRISE_COVERAGE_MATRIX.md",
      "docs/BOSSMIND_ENTERPRISE_ENVELOPE.md",
      "docs/BOSSMIND_GLOBAL_TRAFFIC_DISCOVERY.md",
    ],
  };

  console.log(JSON.stringify(summary, null, 2));
  process.exit(summary.ok ? 0 : 1);
}

main().catch((e) => {
  console.error("[bossmind-global-production-confirm]", e);
  process.exit(1);
});
