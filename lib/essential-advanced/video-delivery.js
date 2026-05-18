/**
 * Essential Advanced premium video delivery (EN/FR, entitlement-gated embed URLs).
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const MANIFEST_PATH = path.join(
  process.cwd(),
  "config/resumora-essential-advanced-videos.json"
);

let cachedManifest = null;

function loadVideoManifest() {
  if (cachedManifest) return cachedManifest;
  const raw = fs.readFileSync(MANIFEST_PATH, "utf8");
  cachedManifest = JSON.parse(raw);
  return cachedManifest;
}

function manifestHash() {
  return crypto.createHash("sha256").update(fs.readFileSync(MANIFEST_PATH, "utf8")).digest("hex");
}

function normalizeLang(lang) {
  return String(lang || "en").toLowerCase() === "fr" ? "fr" : "en";
}

function getVideoModule(videoId) {
  const manifest = loadVideoManifest();
  return (manifest.videos || []).find((v) => v.id === videoId) || null;
}

function listVideoModules() {
  return loadVideoManifest().videos || [];
}

function resolveVideoSource(videoId, lang = "en") {
  const mod = getVideoModule(videoId);
  if (!mod) return null;
  const L = normalizeLang(lang);
  const primary = mod.sources?.[L] || mod.sources?.en;
  if (!primary?.youtubeId) return null;

  const fallbackId =
    primary.fallbackYoutubeId ||
    (L !== "en" ? mod.sources?.en?.youtubeId : null) ||
    null;

  return {
    videoId: mod.id,
    lang: L,
    youtubeId: primary.youtubeId,
    fallbackYoutubeId: fallbackId,
    embedLocale: primary.embedLocale || (L === "fr" ? "fr" : "en"),
    provider: primary.provider || "youtube-nocookie",
    durationMin: mod.durationMin,
    title: mod.title?.[L] || mod.title?.en,
  };
}

function buildYoutubeNocookieEmbedUrl(youtubeId, { locale = "en", autoplay = false } = {}) {
  const params = new URLSearchParams({
    rel: "0",
    modestbranding: "1",
    playsinline: "1",
    hl: locale === "fr" ? "fr" : "en",
    cc_load_policy: locale === "fr" ? "1" : "0",
  });
  if (autoplay) params.set("autoplay", "1");
  return `https://www.youtube-nocookie.com/embed/${youtubeId}?${params.toString()}`;
}

function buildEmbedUrls(source) {
  if (!source) return null;
  const locale = source.embedLocale || source.lang;
  const primary = buildYoutubeNocookieEmbedUrl(source.youtubeId, { locale });
  const fallback = source.fallbackYoutubeId
    ? buildYoutubeNocookieEmbedUrl(source.fallbackYoutubeId, { locale })
    : null;
  return { primary, fallback };
}

function resolveProtectedVideoDelivery(videoId, lang = "en") {
  const source = resolveVideoSource(videoId, lang);
  if (!source) return null;
  const embed = buildEmbedUrls(source);
  return {
    ok: true,
    videoId: source.videoId,
    lang: source.lang,
    provider: source.provider,
    durationMin: source.durationMin,
    title: source.title,
    embedUrl: embed.primary,
    fallbackEmbedUrl: embed.fallback,
    delivery: "gated-api",
  };
}

function sanitizeVideosForClient(lang = "en") {
  const L = normalizeLang(lang);
  return listVideoModules().map((v) => ({
    id: v.id,
    durationMin: v.durationMin,
    title: v.title,
    summary: v.summary,
    lang: L,
    protectedDelivery: true,
  }));
}

function validateVideoManifest() {
  const manifest = loadVideoManifest();
  const videos = manifest.videos || [];
  const errors = [];
  if (videos.length !== 3) {
    errors.push(`expected_3_videos_got_${videos.length}`);
  }
  for (const v of videos) {
    for (const lang of ["en", "fr"]) {
      const src = v.sources?.[lang];
      if (!src?.youtubeId) {
        errors.push(`missing_${v.id}_${lang}`);
      }
    }
  }
  return {
    ok: errors.length === 0,
    videoCount: videos.length,
    manifestHash: manifestHash(),
    errors,
  };
}

async function probeYoutubeAvailability(youtubeId) {
  const url = `https://www.youtube.com/oembed?url=${encodeURIComponent(
    `https://www.youtube.com/watch?v=${youtubeId}`
  )}&format=json`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(12000) });
    return { youtubeId, ok: res.ok || res.status === 401, status: res.status };
  } catch (e) {
    return { youtubeId, ok: false, error: e.message || "probe_failed" };
  }
}

async function probeAllVideoSources() {
  const manifest = loadVideoManifest();
  const probes = [];
  for (const v of manifest.videos || []) {
    for (const lang of ["en", "fr"]) {
      const src = v.sources[lang];
      const primary = await probeYoutubeAvailability(src.youtubeId);
      probes.push({ videoId: v.id, lang, role: "primary", ...primary });
      if (src.fallbackYoutubeId && src.fallbackYoutubeId !== src.youtubeId) {
        const fb = await probeYoutubeAvailability(src.fallbackYoutubeId);
        probes.push({ videoId: v.id, lang, role: "fallback", ...fb });
      }
    }
  }
  const ok = probes.every((p) => p.ok);
  return { ok, probes };
}

module.exports = {
  loadVideoManifest,
  manifestHash,
  listVideoModules,
  getVideoModule,
  resolveVideoSource,
  buildYoutubeNocookieEmbedUrl,
  buildEmbedUrls,
  resolveProtectedVideoDelivery,
  sanitizeVideosForClient,
  validateVideoManifest,
  probeYoutubeAvailability,
  probeAllVideoSources,
};
