#!/usr/bin/env node
/**
 * Checkout + activation orchestration proof (production-safe, read-only probes).
 *   npm run bossmind:checkout:proof
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const hubMemoryDir = process.env.BOSSMIND_HUB_ROOT
  ? path.join(process.env.BOSSMIND_HUB_ROOT, "13-shared-memory")
  : "D:/BossMind/13-shared-memory";
const BASES = [
  process.env.BOSSMIND_VALIDATION_BASE || "https://bossmind-resumora-web.onrender.com",
  "https://www.resumora.net",
].filter((v, i, a) => a.indexOf(v) === i);

async function probe(url) {
  const t0 = Date.now();
  try {
    const res = await fetch(url, { redirect: "follow" });
    let body = {};
    try {
      body = await res.json();
    } catch {
      body = {};
    }
    return { url, status: res.status, ms: Date.now() - t0, ok: res.ok, body };
  } catch (e) {
    return { url, status: 0, ms: Date.now() - t0, ok: false, error: e.message };
  }
}

async function main() {
  const { getStudioCheckoutSuccessUrl } = require(path.join(root, "lib/marketing/stripe-checkout-urls.js"));

  const report = {
    schema: "bossmind-checkout-orchestration-proof-v1",
    generatedAt: new Date().toISOString(),
    successRedirectUrl: getStudioCheckoutSuccessUrl(),
    codeChecks: {
      checkoutBootstrapApi: fs.existsSync(path.join(root, "pages/api/client/checkout-bootstrap.js")),
      studioLuxuryLoader: fs.existsSync(path.join(root, "components/client/StudioLuxuryLoader.jsx")),
      postPaymentActivationRemoved: !fs.existsSync(path.join(root, "components/client/PostPaymentActivation.jsx")),
      clientHubUsesBootstrap: fs
        .readFileSync(path.join(root, "components/client/ClientStudioHub.jsx"), "utf8")
        .includes("checkout-bootstrap"),
    },
    sites: [],
  };

  for (const base of BASES) {
    const o = base.replace(/\/$/, "");
    const routes = await Promise.all([
      probe(`${o}/api/health`),
      probe(`${o}/api/client/checkout-bootstrap?lang=en`),
      probe(`${o}/api/client/activate-plan?lang=en`),
      probe(`${o}/api/client/workspace?lang=en`),
      probe(`${o}/api/verify-session?lang=en`),
      probe(`${o}/studio`),
    ]);
    const health = routes.find((r) => r.url.includes("/api/health"))?.body || {};
    report.sites.push({
      base: o,
      gitCommit: health.gitCommit || null,
      routes: routes.map((r) => ({
        path: r.url.replace(o, ""),
        status: r.status,
        ok: r.ok || r.status === 401 || r.status === 400,
        ms: r.ms,
      })),
      databaseOk: health.database?.ok === true,
      handsFreeApis:
        routes.find((r) => r.url.includes("checkout-bootstrap"))?.status === 200 &&
        routes.find((r) => r.url.includes("/studio"))?.status === 200,
    });
  }

  report.closedLoopReady =
    report.codeChecks.checkoutBootstrapApi &&
    report.codeChecks.studioLuxuryLoader &&
    report.codeChecks.postPaymentActivationRemoved &&
    report.sites.every((s) => s.handsFreeApis);

  fs.mkdirSync(hubMemoryDir, { recursive: true });
  const out = path.join(hubMemoryDir, `resumora-checkout-orchestration-proof-${new Date().toISOString().slice(0, 10)}.json`);
  fs.writeFileSync(out, JSON.stringify(report, null, 2), "utf8");
  console.log(JSON.stringify(report, null, 2));
  console.log(`Wrote ${out}`);
  process.exit(report.closedLoopReady ? 0 : 2);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
