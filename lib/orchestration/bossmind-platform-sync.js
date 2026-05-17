/**
 * GitHub / Railway / Render / Neon / local runtime alignment checks.
 */
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

function gitHead(cwd) {
  try {
    return execSync("git rev-parse HEAD", { cwd, encoding: "utf8" }).trim();
  } catch {
    return null;
  }
}

async function assessPlatformSync({ cwd = process.cwd(), neonApi, projectKey = "resumora", origin } = {}) {
  const head = gitHead(cwd);
  const syncStatus = (() => {
    try {
      return JSON.parse(fs.readFileSync(path.join(cwd, ".bossmind/runtime-sync/status.json"), "utf8"));
    } catch {
      return null;
    }
  })();

  let liveMarker = false;
  let liveOk = false;
  if (origin) {
    try {
      const res = await fetch(`${origin.replace(/\/$/, "")}/`, {
        headers: { "cache-control": "no-cache", "user-agent": "BossMind-PlatformSync/1.0" },
      });
      const html = await res.text();
      liveOk = res.ok;
      liveMarker = html.includes('data-rs-pricing-ui="20260517-lux-v4"');
    } catch {
      liveOk = false;
    }
  }

  let neonAuthority = null;
  if (neonApi?.enabled && neonApi.getRuntimeAuthority) {
    try {
      neonAuthority = await neonApi.getRuntimeAuthority({ projectKey, authorityKey: "luxury_ui_baseline" });
    } catch {
      neonAuthority = null;
    }
  }

  const checks = [
    { id: "git_head", pass: Boolean(head) },
    { id: "neon_configured", pass: Boolean(process.env.NEON_DATABASE_URL) },
    { id: "render_or_site_url", pass: Boolean(process.env.RENDER_API_KEY || process.env.BOSSMIND_REALITY_LIVE_URL || origin) },
    { id: "railway_or_worker", pass: Boolean(process.env.RAILWAY_TOKEN || process.env.RAILWAY_ENVIRONMENT) },
    { id: "local_sync_file", pass: Boolean(syncStatus) },
    { id: "no_local_drift", pass: syncStatus ? !syncStatus.hasDrift : false },
    { id: "live_reachable", pass: !origin || liveOk },
    { id: "live_marker_when_probed", pass: !origin || liveMarker },
    { id: "neon_authority_optional", pass: !neonApi?.enabled || Boolean(neonAuthority) },
  ];

  const earned = checks.filter((c) => c.pass).length;
  return {
    percent: Math.round((earned / checks.length) * 1000) / 10,
    checks,
    gitHead: head,
    neonAuthority: neonAuthority ? { baselineHash: neonAuthority.baseline_hash } : null,
    syncHasDrift: syncStatus?.hasDrift ?? null,
    liveMarker,
  };
}

module.exports = { assessPlatformSync };
