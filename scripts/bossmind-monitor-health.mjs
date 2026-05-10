#!/usr/bin/env node
/**
 * BossMind health monitor for local/prod:
 * - checks runtime, key API endpoints, and optional orchestration endpoint
 * - emits one JSON report suitable for CI or scheduler
 */
import http from "http";
import https from "https";
import { URL } from "url";

const origin = (process.env.BOSSMIND_MONITOR_ORIGIN || "http://127.0.0.1:3001").replace(/\/$/, "");
const orchSecret = process.env.BOSSMIND_ORCHESTRATION_SECRET || "";
const timeoutMs = Number(process.env.BOSSMIND_MONITOR_TIMEOUT_MS || 8000);

const checks = [
  { key: "runtimeHealth", method: "GET", path: "/api/health", expectStatus: [200] },
  { key: "stripeHealth", method: "GET", path: "/api/stripe/status", expectStatus: [200, 503] },
  { key: "deepseekHealth", method: "GET", path: "/api/ai/deepseek-status", expectStatus: [200, 503] },
  { key: "home", method: "GET", path: "/", expectStatus: [200] },
  { key: "pricing", method: "GET", path: "/pricing", expectStatus: [200] },
  { key: "login", method: "GET", path: "/login", expectStatus: [200] },
  { key: "register", method: "GET", path: "/register", expectStatus: [200] },
  { key: "freeTest", method: "GET", path: "/free-test", expectStatus: [200] },
  { key: "frHome", method: "GET", path: "/?lang=fr", expectStatus: [200] },
];

function requestText(target, { method = "GET", headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(target);
    const lib = u.protocol === "https:" ? https : http;
    const req = lib.request(
      target,
      { method, headers, timeout: timeoutMs },
      (res) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          body += chunk;
          if (body.length > 3_000_000) req.destroy(new Error("response too large"));
        });
        res.on("end", () => resolve({ status: res.statusCode || 0, body }));
      }
    );
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", reject);
    req.end();
  });
}

async function runCheck(spec) {
  const url = `${origin}${spec.path}`;
  const headers = { "user-agent": "BossMind-monitor/1.0" };
  if (spec.key === "orchestration" && orchSecret) headers.authorization = `Bearer ${orchSecret}`;

  try {
    const out = await requestText(url, { method: spec.method, headers });
    const ok = spec.expectStatus.includes(out.status);
    return {
      key: spec.key,
      ok,
      status: out.status,
      bytes: out.body.length,
    };
  } catch (error) {
    return { key: spec.key, ok: false, error: error.message };
  }
}

async function main() {
  const dynamicChecks = [...checks];
  if (orchSecret) {
    dynamicChecks.push({
      key: "orchestration",
      method: "GET",
      path: "/api/orchestration/bossmind-control",
      expectStatus: [200],
    });
  }

  const results = [];
  for (const c of dynamicChecks) {
    // Sequential checks reduce CPU/network spikes during degraded runtime.
    const result = await runCheck(c);
    results.push(result);
  }

  const okCount = results.filter((r) => r.ok).length;
  const coverage = Math.round((okCount / results.length) * 100);
  const report = {
    ts: Date.now(),
    origin,
    checks: results,
    okCount,
    total: results.length,
    coveragePercent: coverage,
    healthy: okCount === results.length,
  };

  console.log(JSON.stringify(report, null, 2));
  process.exit(report.healthy ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
