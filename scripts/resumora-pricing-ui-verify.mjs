#!/usr/bin/env node
/**
 * Proof-based live + repo pricing UI verification.
 *   npm run resumora:pricing:ui-verify
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

const ORIGIN = (process.env.RESUMORA_GOOGLE_AUDIT_ORIGIN || "https://resumora.net").replace(/\/$/, "");
const PRICING_UI_MARKER = 'data-rs-pricing-ui="20260517-ea-v3-img2"';
const PLAN_ORDER_RE =
  /id: "basic"[\s\S]*?id: "professional"[\s\S]*?id: "elite"[\s\S]*?id: "essential_advanced"/;

function probeHtml(html, label) {
  return {
    label,
    trustAtAGlance: html.includes("Trust at a glance"),
    rsTrustPanel: html.includes("rs-trust-panel"),
    greenhouseStrip: /Greenhouse · Lever · Workday/i.test(html),
    pricingUiMarker: html.includes(PRICING_UI_MARKER),
    pricingOrderAttr: html.includes('data-rs-pricing-order="basic,professional,elite,essential_advanced"'),
    tierSequence: [...html.matchAll(/data-tier="([^"]+)"/g)].map((m) => m[1]),
    essentialAdvanced: html.includes("Essential Advanced"),
    tiers: {
      basic: html.includes('data-tier="basic"'),
      essential_advanced: html.includes('data-tier="essential_advanced"'),
      professional: html.includes('data-tier="professional"'),
      elite: html.includes('data-tier="elite"'),
    },
  };
}

async function main() {
  const siteCopy = fs.readFileSync(path.join(root, "lib/marketing/site-copy.js"), "utf8");
  const home = fs.readFileSync(path.join(root, "components/marketing/HomePage.jsx"), "utf8");
  const sw = fs.readFileSync(path.join(root, "public/sw.js"), "utf8");
  const trustStub = fs.readFileSync(
    path.join(root, "components/marketing/sections/TrustMetricsPanel.jsx"),
    "utf8"
  );

  const repo = {
    planOrderOk: PLAN_ORDER_RE.test(siteCopy),
    homeNoTrustImport: !home.includes("TrustMetricsPanel"),
    trustPanelNoOp: trustStub.includes("return null"),
    swNetworkFirstHtml: sw.includes("isHtmlNavigation") && !sw.includes('"/",'),
  };

  const pages = ["/", "/pricing"];
  const live = {};
  for (const p of pages) {
    const res = await fetch(`${ORIGIN}${p}`, {
      headers: { "user-agent": "ResumoraPricingUiVerify/1.0" },
    });
    live[p] = probeHtml(await res.text(), p);
  }

  const checks = [
    { id: "repo_plan_order", pass: repo.planOrderOk },
    { id: "repo_trust_removed", pass: repo.homeNoTrustImport && repo.trustPanelNoOp },
    { id: "repo_sw_no_stale_home_cache", pass: repo.swNetworkFirstHtml },
    { id: "live_no_trust_home", pass: !live["/"].trustAtAGlance && !live["/"].rsTrustPanel },
    { id: "live_ea_home", pass: live["/"].tiers.essential_advanced },
    { id: "live_pricing_marker", pass: live["/pricing"].pricingUiMarker || live["/"].pricingUiMarker },
    {
      id: "live_ea_far_right",
      pass: (() => {
        const seq = live["/pricing"].tierSequence.length ? live["/pricing"].tierSequence : live["/"].tierSequence;
        const pricingSlice = seq.filter((t) =>
          ["basic", "professional", "elite", "essential_advanced"].includes(t)
        );
        return pricingSlice.length >= 4 && pricingSlice[pricingSlice.length - 1] === "essential_advanced";
      })(),
    },
    { id: "live_four_tiers_pricing", pass: Object.values(live["/pricing"].tiers).every(Boolean) },
  ];

  const earned = checks.filter((c) => c.pass).length;
  const report = {
    generatedAt: new Date().toISOString(),
    origin: ORIGIN,
    repo,
    live,
    checks,
    passPercent: Math.round((earned / checks.length) * 1000) / 10,
    pass: earned === checks.length,
    note:
      "If live_pricing_marker fails, deploy latest commit to Render and hard-refresh (Ctrl+Shift+R) or clear site data to drop old service worker.",
  };

  const outDir = path.join(root, "windows-heal", "reports");
  fs.mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outFile = path.join(outDir, `resumora-pricing-ui-verify-${stamp}.json`);
  fs.writeFileSync(outFile, JSON.stringify(report, null, 2), "utf8");
  report.reportFile = outFile.replace(/\\/g, "/");

  const lockDir = path.join(root, ".bossmind", "checkpoints");
  fs.mkdirSync(lockDir, { recursive: true });
  fs.writeFileSync(
    path.join(lockDir, "latest-pricing-ui-verify.json"),
    JSON.stringify({ ...report, lockedAt: report.generatedAt }, null, 2),
    "utf8"
  );

  console.log(JSON.stringify(report, null, 2));
  process.exit(report.pass ? 0 : 2);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
