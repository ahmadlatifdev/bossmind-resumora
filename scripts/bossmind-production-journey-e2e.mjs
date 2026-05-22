#!/usr/bin/env node
/**
 * Production journey E2E probes (live URLs only).
 *   npm run bossmind:production:journey-e2e
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const originArg = process.argv.find((a) => a.startsWith("--origin="));
const origin = (originArg ? originArg.split("=")[1] : process.env.BOSSMIND_REALITY_LIVE_URL || "https://www.resumora.net").replace(/\/$/, "");

const JOURNEY = [
  { id: "homepage", path: "/", expectStatus: 200 },
  { id: "login", path: "/login", expectStatus: 200 },
  { id: "register", path: "/register", expectStatus: 200 },
  { id: "pricing", path: "/pricing", expectStatus: 200 },
  { id: "studio", path: "/studio", expectStatus: 200 },
  { id: "success", path: "/success", expectStatus: 200 },
  { id: "health", path: "/api/health", expectStatus: 200, json: true },
  { id: "database_health", path: "/api/runtime/database-health", expectStatus: 200, json: true },
  { id: "checkout_bootstrap", path: "/api/client/checkout-bootstrap?lang=en", expectStatus: 200, json: true },
];

async function probeRoute(route) {
  const url = `${origin}${route.path}`;
  try {
    const res = await fetch(url, {
      headers: { "cache-control": "no-cache", "user-agent": "BossMind-Journey-E2E/1.0" },
      redirect: "follow",
    });
    const text = await res.text();
    let body = null;
    if (route.json) {
      try {
        body = JSON.parse(text);
      } catch {
        body = {};
      }
    }
    return {
      id: route.id,
      url,
      status: res.status,
      ok: res.status === route.expectStatus,
      hasLuxuryPricing: route.path === "/pricing" ? text.includes("rs-pricing") : undefined,
      hasCalmPrepare: route.path === "/studio" || route.path === "/success" ? text.includes("rs-studio-calm-prepare") || text.includes("Preparing") : undefined,
      checkoutReady: route.id === "health" ? body?.stripe?.checkoutReady : undefined,
      databaseOk: route.id === "health" ? body?.database?.ok : undefined,
      gitCommit: route.id === "health" ? body?.gitCommit : undefined,
    };
  } catch (e) {
    return { id: route.id, url, ok: false, error: e.message };
  }
}

async function probeRegisterLogin() {
  const email = `e2e-${Date.now()}@resumora.invalid`;
  const password = "E2eJourney1!";
  const reg = await fetch(`${origin}/api/engagement/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, displayName: "E2E" }),
  });
  const regBody = await reg.json().catch(() => ({}));
  const login = await fetch(`${origin}/api/engagement/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const loginBody = await login.json().catch(() => ({}));
  return {
    id: "register_login_chain",
    registerOk: reg.status === 201 && regBody.ok,
    loginOk: login.status === 200 && loginBody.ok,
    ok: (reg.status === 201 || reg.status === 409) && login.status === 200,
  };
}

async function main() {
  const routes = [];
  for (const r of JOURNEY) routes.push(await probeRoute(r));
  routes.push(await probeRegisterLogin());

  const swRes = await fetch(`${origin}/sw.js`, { headers: { "cache-control": "no-cache" } }).catch(() => null);
  const swText = swRes?.ok ? await swRes.text() : "";
  const swV3 = swText.includes("20260521-journey-v3");

  const report = {
    schema: "bossmind-production-journey-e2e-v1",
    origin,
    verifiedAt: new Date().toISOString(),
    routes,
    serviceWorkerV3: swV3,
    ok: routes.every((r) => r.ok) && swV3,
    criticalFailures: routes.filter((r) => !r.ok).map((r) => r.id),
  };

  const outDir = path.join(root, ".bossmind/validation");
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "latest-journey-e2e.json"), JSON.stringify(report, null, 2), "utf8");

  const memDir = path.join(root, "..", "13-shared-memory");
  try {
    fs.mkdirSync(memDir, { recursive: true });
    fs.writeFileSync(
      path.join(memDir, `resumora-journey-e2e-${report.verifiedAt.slice(0, 10)}.json`),
      JSON.stringify(report, null, 2),
      "utf8"
    );
  } catch {
    /* ignore */
  }

  console.log(JSON.stringify(report, null, 2));
  process.exit(report.ok ? 0 : 2);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
