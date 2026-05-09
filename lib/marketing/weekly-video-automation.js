/**
 * Official weekly short-form automation scaffold (YouTube Shorts + TikTok).
 * Wire CI/CD or BossMind workers to consume this shape for 1-minute vertical exports.
 */

const PILLARS_EN = [
  "Resume expertise & positioning",
  "ATS optimization & parsers",
  "Interview success & storytelling",
  "Executive resume authority",
  "Global hiring & mobility insights",
];

const PILLARS_FR = [
  "Expertise CV & positionnement",
  "Optimisation ATS & parseurs",
  "Réussite entretien & narration",
  "Autorité du CV direction",
  "Recrutement mondial & mobilité",
];

export function getWeeklyVideoAutomationBundle(lang, weekId) {
  const pillars = lang === "fr" ? PILLARS_FR : PILLARS_EN;
  const youtube = process.env.NEXT_PUBLIC_YOUTUBE_CHANNEL_URL || "https://www.youtube.com/@Resumora";
  const tiktok = process.env.NEXT_PUBLIC_TIKTOK_PROFILE_URL || "https://www.tiktok.com/@resumora";

  return {
    weekId,
    durationTargetSec: 60,
    aspectRatio: "9:16",
    exportPreset: "vertical_1080x1920",
    youtube: {
      channelUrl: youtube,
      format: "Shorts",
      cadence: "weekly",
      suggestedTitleTemplate:
        lang === "fr"
          ? `Resumora · Semaine ${weekId} · {{topic}}`
          : `Resumora · Week ${weekId} · {{topic}}`,
    },
    tiktok: {
      profileUrl: tiktok,
      cadence: "weekly",
      captionHashtags: ["#Resumora", "#ExecutiveResume", "#ATS", "#Career", "#Leadership"],
    },
    contentPillars: pillars.map((label, i) => ({ id: `p-${i}`, label })),
    automationHooks: {
      queueKey: "BOSSMIND_WEEKLY_SHORT",
      variationSeed: weekId,
      publishWindowsUtc: ["Tue 14:00", "Thu 18:00"],
      assetSlots: ["cold_open", "proof_point", "cta_resumora_net"],
    },
    placeholders: {
      voiceoverScript: lang === "fr" ? "À générer — voix FR cadre" : "To generate — executive EN voice",
      bRoll: "Logo sting · typography · proof bullets · end card resumora.net",
    },
  };
}
