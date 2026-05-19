#!/usr/bin/env node
/**
 * Essential Advanced 100% production activation — content, EN/FR, Stripe, live probes.
 *   npm run resumora:essential-advanced:full-activate
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const hubRoot = process.env.BOSSMIND_HUB_ROOT || "D:/BossMind";
const hubMemory = path.join(hubRoot, "13-shared-memory");

function run(cmd, args) {
  const r = spawnSync(cmd, args, { cwd: root, encoding: "utf8", shell: true });
  return { ok: r.status === 0, stdout: r.stdout || "", stderr: r.stderr || "" };
}

function parseSetCookie(res) {
  const raw = res.headers.getSetCookie?.() || [];
  if (raw.length) return raw.join("; ");
  const h = res.headers.get("set-cookie");
  return h || "";
}

async function fetchWithCookie(url, init = {}, cookie = "") {
  const headers = { ...(init.headers || {}) };
  if (cookie) headers.Cookie = cookie;
  const res = await fetch(url, { ...init, headers, signal: AbortSignal.timeout(90000) });
  const body = await res.json().catch(() => ({}));
  return { res, body, cookie: parseSetCookie(res) || cookie };
}

async function productionGatedFlow(origin) {
  const o = origin.replace(/\/$/, "");
  const email = `ea-full-${Date.now()}@resumora.invalid`;
  const password = "EaFullAct123!";
  let cookie = "";

  const reg = await fetchWithCookie(`${o}/api/engagement/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, displayName: "EA Full" }),
  });
  if (reg.res.status !== 201 || !reg.body?.ok) {
    return { ok: false, step: "register", status: reg.res.status };
  }
  cookie = reg.cookie;
  const profileId = reg.body.profile?.id;

  const store = require(path.join(root, "lib/engagement/store.js"));
  const { grantEntitlement, PLAN_ESSENTIAL_ADVANCED } = require(path.join(
    root,
    "lib/client/entitlements-store.js"
  ));
  const { ensureEngagementSchema } = require(path.join(root, "lib/shared/neon-memory.js"));
  require(path.join(root, "lib/shared/load-project-env.js")).loadProjectEnv(root);
  await ensureEngagementSchema();
  const grant = await grantEntitlement({
    planId: PLAN_ESSENTIAL_ADVANCED,
    profileId,
    customerEmail: email,
  });
  if (!grant.ok) return { ok: false, step: "grant", error: grant.error };

  for (const lang of ["en", "fr"]) {
    const cat = await fetchWithCookie(`${o}/api/essential-advanced/catalog?lang=${lang}`, {}, cookie);
    if (!cat.res.ok || !cat.body?.catalog) {
      return { ok: false, step: `catalog_${lang}`, status: cat.res.status };
    }
    const c = cat.body.catalog.counts;
    if (c.videos < 3 || c.qa < 50 || c.tips < 20) {
      return { ok: false, step: `catalog_counts_${lang}`, counts: c };
    }
  }

  const vid = await fetchWithCookie(
    `${o}/api/essential-advanced/video?videoId=video_star_mastery&lang=en`,
    {},
    cookie
  );
  if (!vid.res.ok || !vid.body?.embedUrl) {
    return { ok: false, step: "video_delivery", status: vid.res.status };
  }

  const dl = await fetchWithCookie(
    `${o}/api/essential-advanced/download?assetId=dl_star_workbook&lang=en`,
    {},
    cookie
  );

  return {
    ok: true,
    profileId,
    catalogEn: true,
    catalogFr: true,
    videoEmbed: Boolean(vid.body?.embedUrl),
    downloadOk: dl.res.ok,
  };
}

async function probePublicUrls(origin) {
  const o = origin.replace(/\/$/, "");
  const paths = ["/studio/essential-advanced", "/pricing", "/register"];
  const results = {};
  for (const p of paths) {
    try {
      const res = await fetch(`${o}${p}`, { signal: AbortSignal.timeout(60000) });
      results[p] = { ok: res.ok, status: res.status };
    } catch (e) {
      results[p] = { ok: false, error: e.message };
    }
  }
  return results;
}

async function main() {
  require(path.join(root, "lib/shared/load-project-env.js")).loadProjectEnv(root);
  const { runFullIntegrityAudit } = require(path.join(
    root,
    "lib/essential-advanced/content-integrity.js"
  ));
  const { auditStripeProductionState } = require(path.join(root, "lib/marketing/stripe-env-audit.js"));
  const { probeAllVideoSources } = require(path.join(root, "lib/essential-advanced/video-delivery.js"));
  const { priceIdsFromLock } = require(path.join(root, "lib/marketing/stripe-price-lock.js"));

  const integrity = runFullIntegrityAudit();
  const videoProbes = await probeAllVideoSources();
  const stripe = auditStripeProductionState();

  const phases = {
    stripeRepair: run("npm", ["run", "bossmind:stripe:repair"]),
    stripeSync: run("npm", ["run", "bossmind:stripe:production-sync"]),
    hubBootstrap: run("npm", ["run", "bossmind:hub-env-bootstrap"]),
    renderBundle: run("npm", ["run", "bossmind:render:env-bundle"]),
  };

  const origins = [
    "https://www.resumora.net",
    "https://bossmind-resumora-web.onrender.com",
  ];
  const live = {};
  for (const origin of origins) {
    let health = {};
    try {
      const h = await fetch(`${origin}/api/health`, { signal: AbortSignal.timeout(90000) });
      health = await h.json();
    } catch (e) {
      health = { error: e.message };
    }
    live[origin] = {
      publicUrls: await probePublicUrls(origin),
      health: {
        ok: health.ok,
        checkoutReady: health.stripe?.checkoutReady,
        financialPipelineReady: health.stripe?.financialPipelineReady,
        allStripePrices: health.plans?.allStripePrices,
        commerceReady: health.commerceReady,
      },
      gatedFlow: await productionGatedFlow(origin),
    };
  }

  const scores = {
    enContentReadiness: integrity.dimensions.enCatalog,
    frContentReadiness: integrity.dimensions.frCatalog,
    videoReadiness: videoProbes.ok ? 100 : 0,
    qaReadiness: integrity.dimensions.qa,
    interviewTipsReadiness: integrity.dimensions.tips,
    stripeCommerceReadiness: stripe.checkoutReady && stripe.financialPipelineReady ? 100 : stripe.checkoutReady ? 85 : 50,
    gatedDeliveryReadiness: Object.values(live).some((l) => l.gatedFlow?.ok) ? 100 : 0,
  };

  const overall = Math.round(Object.values(scores).reduce((a, b) => a + b, 0) / Object.values(scores).length);

  const partialItems = [];
  if (!integrity.ok) partialItems.push("local_content_integrity");
  if (!videoProbes.ok) partialItems.push("youtube_probe");
  if (!stripe.checkoutReady) partialItems.push("stripe_checkout_local");
  if (!Object.values(live).every((l) => l.gatedFlow?.ok)) partialItems.push("live_gated_flow");
  if (!Object.values(live).every((l) => l.health?.checkoutReady)) {
    partialItems.push("live_health_stripe_flags_pending_deploy_or_render_env");
  }

  const report = {
    version: 1,
    generatedAt: new Date().toISOString(),
    planId: "essential_advanced",
    activeStripeProducts: Object.keys(priceIdsFromLock()),
    activePriceIds: priceIdsFromLock(),
    webhookStatus: {
      signingReady: stripe.webhookSigningReady,
      endpoint: "/api/webhooks/stripe",
    },
    checkoutReadiness: {
      checkoutReady: stripe.checkoutReady,
      financialPipelineReady: stripe.financialPipelineReady,
    },
    runtimeReadiness: integrity,
    scores,
    overallEssentialAdvancedProductionReadinessPercent: overall,
    fullyOperational: overall >= 95 && integrity.ok && Object.values(live).some((l) => l.gatedFlow?.ok),
    partialItems,
    phases,
    live,
    videoProbes: { ok: videoProbes.ok, probeCount: videoProbes.probes?.length },
  };

  const out = path.join(hubMemory, `resumora-essential-advanced-full-activate-${new Date().toISOString().slice(0, 10)}.json`);
  fs.mkdirSync(hubMemory, { recursive: true });
  fs.writeFileSync(out, JSON.stringify(report, null, 2));
  report.hubMemoryPath = out;

  const localDir = path.join(root, "windows-heal/reports");
  fs.mkdirSync(localDir, { recursive: true });
  const localPath = path.join(localDir, `ea-full-activate-${Date.now()}.json`);
  fs.writeFileSync(localPath, JSON.stringify(report, null, 2));

  console.log(JSON.stringify(report, null, 2));
  process.exit(report.fullyOperational ? 0 : overall >= 90 ? 0 : 2);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
