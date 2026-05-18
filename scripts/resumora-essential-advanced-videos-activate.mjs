#!/usr/bin/env node
/**
 * Validate + lock Essential Advanced premium videos (3 × EN/FR, gated delivery).
 *
 *   node scripts/resumora-essential-advanced-videos-activate.mjs
 *   node scripts/resumora-essential-advanced-videos-activate.mjs --lock --i-understand-production --notes="..."
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

function hasFlag(n) {
  return process.argv.includes(`--${n}`);
}
function arg(name, def = "") {
  const eq = process.argv.find((a) => a.startsWith(`--${name}=`));
  return eq ? eq.slice(name.length + 3) : def;
}

async function fetchJson(url, init) {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(25000) });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, ok: res.ok, body };
}

async function main() {
  if (hasFlag("lock") && !hasFlag("i-understand-production")) {
    console.error("Refusing lock without --i-understand-production");
    process.exit(1);
  }

  require(path.join(root, "lib/shared/ensure-project-env.js"));
  const video = require(path.join(root, "lib/essential-advanced/video-delivery.js"));
  const { grantEntitlement, hasEntitlement, PLAN_ESSENTIAL_ADVANCED } = require(path.join(
    root,
    "lib/client/entitlements-store.js"
  ));
  const store = require(path.join(root, "lib/engagement/store.js"));
  const { ensureEngagementSchema } = require(path.join(root, "lib/shared/neon-memory.js"));

  const manifestCheck = video.validateVideoManifest();
  const probes = await video.probeAllVideoSources();

  await ensureEngagementSchema();
  const email = `ea-video-${Date.now()}@resumora-video-e2e.invalid`;
  const reg = await store.registerProfile({
    email,
    password: "EaVideoTest123!",
    displayName: "EA Video E2E",
  });

  let localApi = { ok: false };
  if (reg.ok) {
    await grantEntitlement({
      planId: PLAN_ESSENTIAL_ADVANCED,
      profileId: reg.profile.id,
      customerEmail: email,
    });
    const access = await hasEntitlement(reg.profile.id, email, PLAN_ESSENTIAL_ADVANCED);
    const deliveries = [];
    for (const v of video.listVideoModules()) {
      for (const lang of ["en", "fr"]) {
        const d = video.resolveProtectedVideoDelivery(v.id, lang);
        deliveries.push({
          videoId: v.id,
          lang,
          ok: Boolean(d?.embedUrl),
          hasFallback: Boolean(d?.fallbackEmbedUrl),
        });
      }
    }
    localApi = { ok: access.entitled && deliveries.every((d) => d.ok), deliveries, entitled: access.entitled };
  }

  const liveOrigin = (arg("live-origin") || process.env.BOSSMIND_REALITY_LIVE_URL || "https://www.resumora.net").replace(
    /\/$/,
    ""
  );
  const liveHealth = await fetchJson(`${liveOrigin}/api/health`);
  const liveVideoProbe = await fetchJson(
    `${liveOrigin}/api/essential-advanced/video?videoId=video_star_mastery&lang=en`
  );

  const localBlockers = [];
  const liveBlockers = [];
  if (!manifestCheck.ok) localBlockers.push("manifest_invalid");
  const enPrimary = (probes.probes || []).filter((p) => p.lang === "en" && p.role === "primary");
  if (!enPrimary.length || !enPrimary.every((p) => p.ok)) {
    localBlockers.push("youtube_probe_failed");
  }
  if (!localApi.ok) localBlockers.push("local_entitlement_delivery_failed");
  if (!liveHealth.body?.database?.ok) liveBlockers.push("live_database_offline");
  if (liveVideoProbe.status !== 401 && liveVideoProbe.status !== 403 && !liveHealth.body?.database?.ok) {
    liveBlockers.push("live_video_api_unreachable");
  }

  const report = {
    ok: localBlockers.length === 0,
    liveOk: liveBlockers.length === 0,
    generatedAt: new Date().toISOString(),
    manifestCheck,
    probes: { ok: probes.ok, count: probes.probes?.length },
    localApi,
    live: {
      origin: liveOrigin,
      databaseOk: liveHealth.body?.database?.ok === true,
      videoApiStatus: liveVideoProbe.status,
    },
    localBlockers,
    liveBlockers,
    manifestHash: video.manifestHash(),
  };

  const reportsDir = path.join(root, "windows-heal/reports");
  fs.mkdirSync(reportsDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const reportPath = path.join(reportsDir, `essential-advanced-videos-activate-${stamp}.json`);
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  if (hasFlag("lock")) {
    const neon = require(path.join(root, "lib/shared/neon-memory.js"));
    const sql = neon.getSqlClient();
    const payload = {
      lockedAt: report.generatedAt,
      memoryType: "ESSENTIAL_ADVANCED_PREMIUM_VIDEOS_LIVE",
      videoCount: 3,
      bilingualEnFr: true,
      delivery: "youtube-nocookie-gated-api",
      manifestHash: report.manifestHash,
      probesOk: probes.ok,
      notes: arg("notes", "").slice(0, 2000),
    };
    if (sql) {
      try {
        await neon.upsertLastConfirmedCheckpoint({
          projectKey: process.env.BOSSMIND_PROJECT_KEY || "resumora",
          checkpointKey: "essential_advanced_premium_videos",
          payload,
          source: "resumora-essential-advanced-videos-activate",
          locked: true,
        });
      } catch (e) {
        payload.neonCheckpointSkipped = e.message;
      }
    }
    const lockPath = path.join(root, "config/bossmind-essential-advanced-videos-lock.json");
    fs.writeFileSync(lockPath, JSON.stringify(payload, null, 2));
    report.lockPath = lockPath;
  }

  console.log(JSON.stringify({ ...report, reportPath }, null, 2));
  process.exit(report.ok ? 0 : 2);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
