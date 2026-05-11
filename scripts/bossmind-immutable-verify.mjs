#!/usr/bin/env node
/**
 * Verify workspace matches sealed immutable baseline. Blocks accidental UI drift before deploy.
 * Bypass (explicit approval only): BOSSMIND_BASELINE_OVERRIDE=1
 */
import { createRequire } from "module";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import https from "https";
import http from "http";

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const { loadManifest } = require(join(root, "lib/orchestration/bossmind-interface-authority.js"));
const { verifyImmutableBaseline } = require(join(root, "lib/orchestration/bossmind-immutable-baseline.js"));

const override = process.env.BOSSMIND_BASELINE_OVERRIDE === "1";
const envProbeOrigin = (process.env.BOSSMIND_IMMUTABLE_PROBE_ORIGIN || "").replace(/\/$/, "");

function fetchText(urlString, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlString);
    const lib = u.protocol === "https:" ? https : http;
    const req = lib.request(
      urlString,
      { method: "GET", timeout: timeoutMs, headers: { "user-agent": "BossMind-immutable-verify/1.0" } },
      (res) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (c) => {
          body += c;
          if (body.length > 2_000_000) req.destroy(new Error("response too large"));
        });
        res.on("end", () => resolve({ status: res.statusCode || 0, body }));
      }
    );
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", reject);
    req.end();
  });
}

async function verifyProductionProbe(probeOrigin) {
  const origin = (probeOrigin || "").replace(/\/$/, "");
  if (!origin) return { skipped: true };
  const markers = loadManifest(root)?.requiredHomeHtmlMarkers || [
    'id="top"',
    'id="trust"',
    'id="home-intake"',
    'id="pricing"',
  ];
  try {
    const first = await fetchText(`${origin}/`);
    const body = first.body;
    const ok =
      first.status === 200 &&
      markers.every((m) => body.includes(m)) &&
      !(
        body.includes('id="pricing"') &&
        !body.includes('id="home-intake"')
      );
    return { ok, status: first.status, origin };
  } catch (e) {
    return { ok: false, error: e.message, origin };
  }
}

const v = verifyImmutableBaseline(root);
const lockOrigin = (v.lock?.productionPublicOrigin || "").replace(/\/$/, "");
const prod = await verifyProductionProbe(
  envProbeOrigin || (process.env.BOSSMIND_IMMUTABLE_PROBE_FROM_LOCK === "1" ? lockOrigin : "")
);

if (!v.enabled) {
  console.log("bossmind-immutable-verify: baseline lock disabled (config missing or enabled=false).");
  process.exit(0);
}

let failed = false;
const lines = [];

if (!v.luxuryOk) {
  failed = true;
  lines.push(
    `LUXURY_SLICE_MISMATCH current=${v.luxury?.hash || "?"} expected=${v.lock?.lockedLuxuryInterfaceFingerprint || "?"}`
  );
}
if (!v.workspaceOk) {
  failed = true;
  lines.push(
    `FULL_WORKSPACE_MISMATCH current=${v.workspace?.hash || "?"} expected=${v.lock?.lockedFullWorkspaceFingerprint || "?"}`
  );
}

if (!prod.skipped && !prod.ok) {
  failed = true;
  lines.push(`PRODUCTION_PROBE_FAILED ${prod.origin || ""} ${prod.error || prod.status}`);
}

if (failed) {
  console.error("bossmind-immutable-verify: FAILED");
  for (const l of lines) console.error("  " + l);
  if (override) {
    console.warn(
      "bossmind-immutable-verify: BOSSMIND_BASELINE_OVERRIDE=1 — explicit approval path; exiting 0 (re-seal baseline after intentional UI change)."
    );
    process.exit(0);
  }
  process.exit(1);
}

console.log("bossmind-immutable-verify: OK (luxury + full workspace checksums match sealed baseline)");
if (!prod.skipped) {
  console.log(`  production probe: OK (${prod.origin})`);
} else {
  console.log("  production probe: skipped (set BOSSMIND_IMMUTABLE_PROBE_ORIGIN=https://resumora.net for live check)");
}
process.exit(0);
