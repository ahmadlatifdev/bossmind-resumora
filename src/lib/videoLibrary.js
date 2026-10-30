/**
 * Videos Library — Premium Interview Series v1 (4 × ≤8:00, EN/FR/ES).
 * Catalog is served from Firestore; no hardcoded demo sources.
 * Full scripts: content/interview-series/
 */

export const MAX_VIDEO_DOWNLOADS = 5;
export const VIDEO_DURATION_SEC = 480;
export const SERIES_ID = 'premium-interview-series-v1';

export const VIDEO_LIBRARY = Object.freeze([]);

export function formatDuration(sec = VIDEO_DURATION_SEC) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function getVoiceoverScript(video, lang = 'en') {
  if (!video?.voiceover) return '';
  return video.voiceover[lang] || video.voiceover.en || '';
}
