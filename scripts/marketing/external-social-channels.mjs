#!/usr/bin/env node
/**
 * External-only YouTube / TikTok automation metadata for BossMind workers.
 * Not imported by the Next.js app — run from CI or a scheduler with env set.
 *
 * Env:
 *   YOUTUBE_CHANNEL_URL — official channel (Shorts published here only)
 *   TIKTOK_PROFILE_URL  — official TikTok profile
 *
 * Usage: node scripts/marketing/external-social-channels.mjs [weekId]
 */

const weekId = process.argv[2] || new Date().toISOString().slice(0, 10);

const youtube =
  process.env.YOUTUBE_CHANNEL_URL || "https://www.youtube.com/@Resumora";
const tiktok =
  process.env.TIKTOK_PROFILE_URL || "https://www.tiktok.com/@resumora";

const bundle = {
  weekId,
  durationTargetSec: 60,
  aspectRatio: "9:16",
  exportPreset: "vertical_1080x1920",
  youtube: {
    channelUrl: youtube,
    format: "Shorts",
    cadence: "weekly",
    suggestedTitleTemplate: `Resumora · Week ${weekId} · {{topic}}`,
  },
  tiktok: {
    profileUrl: tiktok,
    cadence: "weekly",
    captionHashtags: ["#Resumora", "#ExecutiveResume", "#ATS", "#Career", "#Leadership"],
  },
    automationHooks: {
    queueKey: "BOSSMIND_WEEKLY_ORGANIC_SINGLE",
    variationSeed: weekId,
    publishWindowsUtc: ["Wed 16:00"],
    assetSlots: ["cold_open", "proof_point", "cta_resumora_net"],
  },
  engagement: {
    note:
      "Subscribe, like, comment, and share live on YouTube/TikTok only; analytics may POST to /api/integrations/social-ingest with SOCIAL_INGEST_SECRET.",
  },
};

console.log(JSON.stringify(bundle, null, 2));
