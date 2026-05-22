/**
 * Runtime stability probes — redirect chains, checkout readiness, SW version, activation API.
 */
const fs = require("fs");
const path = require("path");

async function fetchWithRedirects(url, maxRedirects = 5) {
  const chain = [];
  let current = url;
  for (let i = 0; i < maxRedirects; i++) {
    const res = await fetch(current, {
      redirect: "manual",
      headers: { "cache-control": "no-cache", "user-agent": "BossMind-Stability/1.0" },
    });
    chain.push({ url: current, status: res.status });
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc) break;
      current = loc.startsWith("http") ? loc : new URL(loc, current).href;
      continue;
    }
    const html = await res.text().catch(() => "");
    return { chain, finalStatus: res.status, html, ok: res.ok };
  }
  return { chain, finalStatus: 0, html: "", ok: false, error: "redirect_limit" };
}

async function probeApi(origin, apiPath) {
  const url = `${origin.replace(/\/$/, "")}${apiPath}`;
  try {
    const res = await fetch(url, {
      headers: { "cache-control": "no-cache" },
    });
    const body = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, body };
  } catch (e) {
    return { ok: false, status: 0, error: e.message };
  }
}

function readSwVersion(cwd) {
  try {
    const sw = fs.readFileSync(path.join(cwd, "public/sw.js"), "utf8");
    const m = sw.match(/SW_VERSION\s*=\s*["']([^"']+)["']/);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

async function runRuntimeStabilityProbe({
  cwd = process.cwd(),
  origin = "https://www.resumora.net",
  cfg = {},
} = {}) {
  const expectedSw = cfg.serviceWorker?.expectedVersion || "20260521-journey-v3";
  const localSw = readSwVersion(cwd);
  const checks = [];

  const health = await probeApi(origin, "/api/health");
  checks.push({ id: "health_200", pass: health.ok && health.status === 200 });
  checks.push({
    id: "database_ok",
    pass: health.body?.database?.ok === true,
  });
  checks.push({
    id: "checkout_ready",
    pass: health.body?.stripe?.checkoutReady === true,
    optional: !cfg.validation?.requireCheckoutReadyForFullPass,
  });

  const loginProbe = await fetchWithRedirects(`${origin.replace(/\/$/, "")}/login?cachebust=${Date.now()}`);
  const studioProbe = await fetchWithRedirects(`${origin.replace(/\/$/, "")}/studio?cachebust=${Date.now()}`);
  const pricingProbe = await fetchWithRedirects(`${origin.replace(/\/$/, "")}/pricing?cachebust=${Date.now()}`);

  const loopDetected = (probe) => {
    const paths = probe.chain.map((c) => {
      try {
        return new URL(c.url).pathname;
      } catch {
        return c.url;
      }
    });
    const pingPong =
      (paths.includes("/login") && paths.includes("/studio")) ||
      (paths.includes("/login") && paths.includes("/pricing") && paths.filter((p) => p === "/login").length > 1);
    return pingPong || probe.chain.length >= 5;
  };

  checks.push({ id: "login_no_redirect_loop", pass: !loopDetected(loginProbe) && loginProbe.finalStatus === 200 });
  checks.push({ id: "studio_no_redirect_loop", pass: !loopDetected(studioProbe) });
  checks.push({ id: "studio_reachable", pass: studioProbe.finalStatus === 200 });
  checks.push({ id: "pricing_200", pass: pricingProbe.finalStatus === 200 });

  const bootstrap = await probeApi(origin, "/api/client/checkout-bootstrap?lang=en");
  checks.push({ id: "checkout_bootstrap_api", pass: bootstrap.status === 200 });

  checks.push({ id: "sw_version_local", pass: localSw === expectedSw });

  const earned = checks.filter((c) => c.pass).length;
  const required = checks.filter((c) => !c.optional);
  const requiredPass = required.filter((c) => c.pass).length;

  return {
    percent: Math.round((earned / checks.length) * 1000) / 10,
    requiredPercent: Math.round((requiredPass / Math.max(required.length, 1)) * 1000) / 10,
    checks,
    health: {
      gitCommit: health.body?.gitCommit,
      checkoutReady: health.body?.stripe?.checkoutReady,
      commerceReady: health.body?.commerceReady,
    },
    redirectChains: {
      login: loginProbe.chain,
      studio: studioProbe.chain,
      pricing: pricingProbe.chain,
    },
    serviceWorker: { expected: expectedSw, local: localSw },
    blockDeploy: loopDetected(loginProbe) || loopDetected(studioProbe),
    loopDetected: loopDetected(loginProbe) || loopDetected(studioProbe),
  };
}

module.exports = { runRuntimeStabilityProbe, fetchWithRedirects };
