#!/usr/bin/env node
/**
 * Proof-based report: Essential Advanced plan UI + Stripe mapping (no fabricated %).
 *
 *   npm run resumora:essential-advanced:production-report
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

function pct(earned, max) {
  if (!max) return 0;
  return Math.round((earned / max) * 1000) / 10;
}

async function main() {
  require(path.join(root, "lib/shared/load-project-env.js")).loadProjectEnv(root);

  const { ESSENTIAL_ADVANCED_PRICE_USD } = require(path.join(
    root,
    "lib/marketing/service-quote-pricing.js"
  ));
  const { resolveStripePriceId, ALLOWED_PLAN_IDS } = require(path.join(
    root,
    "lib/marketing/stripe-plan-map.js"
  ));
  const { auditStripeEnv } = require(path.join(root, "lib/marketing/stripe-env-audit.js"));

  const siteCopyRaw = fs.readFileSync(path.join(root, "lib/marketing/site-copy.js"), "utf8");
  const planInSiteCopy =
    siteCopyRaw.includes('id: "essential_advanced"') && siteCopyRaw.includes("ESSENTIAL_ADVANCED_PRICE_USD");
  const priceId = resolveStripePriceId("essential_advanced");
  const audit = auditStripeEnv();
  const origin = (process.env.RESUMORA_GOOGLE_AUDIT_ORIGIN || "https://resumora.net").replace(/\/$/, "");

  let liveHtml = { ok: false };
  try {
    const res = await fetch(`${origin}/pricing`, {
      headers: { "user-agent": "ResumoraEssentialAdvancedReport/1.0" },
    });
    const html = await res.text();
    liveHtml = {
      ok: res.ok,
      status: res.status,
      mentionsEssentialAdvanced: /Essential Advanced/i.test(html),
      mentions110: /\$110|110\s*USD/i.test(html),
      hasPricingGrid: /rs-pricing-grid/.test(html),
    };
  } catch (e) {
    liveHtml = { ok: false, error: e.message || String(e) };
  }

  const planOrderOk = /id: "basic"[\s\S]*?id: "essential_advanced"[\s\S]*?id: "professional"[\s\S]*?id: "elite"/.test(
    siteCopyRaw
  );
  const homeNoTrust = !fs
    .readFileSync(path.join(root, "components/marketing/HomePage.jsx"), "utf8")
    .includes("TrustMetricsPanel");

  const checks = [
    { id: "plan_in_site_copy", pass: planInSiteCopy },
    { id: "plan_order_basic_ea_pro_elite", pass: planOrderOk },
    { id: "trust_section_removed_home", pass: homeNoTrust },
    { id: "price_110_usd", pass: ESSENTIAL_ADVANCED_PRICE_USD === 110 && siteCopyRaw.includes("$110") },
    { id: "stripe_price_env_resolved", pass: Boolean(priceId) },
    { id: "allowed_checkout_plan", pass: ALLOWED_PLAN_IDS.includes("essential_advanced") },
    { id: "config_authority_present", pass: fs.existsSync(path.join(root, "config/resumora-essential-advanced-plan.json")) },
    { id: "live_pricing_page", pass: liveHtml.ok && liveHtml.mentionsEssentialAdvanced },
  ];

  const earned = checks.filter((c) => c.pass).length;
  const report = {
    generatedAt: new Date().toISOString(),
    planId: "essential_advanced",
    priceUsd: ESSENTIAL_ADVANCED_PRICE_USD,
    stripePriceId: priceId || null,
    checkoutReady: audit.checkoutReady,
    pricingResolution: audit.pricingResolution?.plans?.essential_advanced,
    liveHtml,
    checks,
    productionReadinessPercent: pct(earned, checks.length),
    operatorActions: priceId
      ? ["Deploy to Render with NEXT_PUBLIC_STRIPE_PRICE_ESSENTIAL_ADVANCED set.", "Run interface lock after live verify."]
      : [
          "Create Stripe one-time Price $110 USD for Essential Advanced.",
          "Set NEXT_PUBLIC_STRIPE_PRICE_ESSENTIAL_ADVANCED=price_xxx on Render and redeploy.",
        ],
  };

  const outDir = path.join(root, "windows-heal", "reports");
  fs.mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outFile = path.join(outDir, `resumora-essential-advanced-production-${stamp}.json`);
  fs.writeFileSync(outFile, JSON.stringify(report, null, 2), "utf8");
  report.reportFile = outFile.replace(/\\/g, "/");

  console.log(JSON.stringify(report, null, 2));
  process.exit(earned === checks.length ? 0 : 2);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
