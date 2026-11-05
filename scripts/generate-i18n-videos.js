#!/usr/bin/env node
/**
 * Generate i18n videos end-to-end:
 *   1. Extract PER-LANGUAGE script text from docs/interview-series/<id>.md
 *   2. TTS → MP3 (Google Cloud Text-to-Speech, with google-tts-api fallback)
 *      — reuses existing audio/<id>-<lang>.mp3 when present
 *   3. FFmpeg: loop a static brand background + audio → 1080p H.264 MP4
 *   4. Verify output duration with ffprobe
 *
 * Output: assets/vid-star-conversational-build-<LANG>/<id>-<lang>.mp4
 *
 * Usage:
 *   node scripts/generate-i18n-videos.js
 *   node scripts/generate-i18n-videos.js --lang en          # English only
 *   node scripts/generate-i18n-videos.js --video 01-resume-to-interview --lang en
 *   node scripts/generate-i18n-videos.js --skip-tts         # don't synthesize (reuse audio only)
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = process.cwd();
const AUDIO_DIR = path.join(ROOT, 'audio');
const SCRIPTS_DIR = path.join(ROOT, 'docs', 'interview-series');
const LOGO = path.join(ROOT, 'public', 'resumora-logo.png');
const ASSETS_DIR = path.join(ROOT, 'assets');
const BACKGROUND = path.join(ASSETS_DIR, 'resumora-background.png');

const VIDEOS = [
  { id: '01-resume-to-interview', title: 'Resume-to-Interview Mastery' },
  { id: '02-star-behavioral', title: 'Behavioral & STAR Method' },
  { id: '03-situational-async', title: 'Situational & Async Interviews' },
  { id: '04-global-career', title: 'Global Career Positioning' },
];

const ALL_LANGS = ['en', 'fr', 'es'];
const VOICES = {
  en: { languageCode: 'en-US', name: 'en-US-Chirp3-HD-Charon' },
  fr: { languageCode: 'fr-FR', name: 'fr-FR-Chirp3-HD-Charon' },
  es: { languageCode: 'es-ES', name: 'es-ES-Chirp3-HD-Charon' },
};

function parseArgs(argv) {
  const args = { langs: ALL_LANGS, video: null, skipTts: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--lang' && argv[i + 1]) args.langs = argv[++i].split(',').map((s) => s.trim());
    else if (a === '--video' && argv[i + 1]) args.video = argv[++i];
    else if (a === '--skip-tts') args.skipTts = true;
  }
  return args;
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function outDirFor(lang) {
  return path.join(ASSETS_DIR, `vid-star-conversational-build-${lang.toUpperCase()}`);
}

/**
 * Extract the text for a single language from the multi-language .md script.
 * Sections are delimited by "## EN", "## FR", "## ES" headings.
 */
function extractLanguageScript(id, lang) {
  const p = path.join(SCRIPTS_DIR, `${id}.md`);
  if (!fs.existsSync(p)) return '';
  const lines = fs.readFileSync(p, 'utf8').split('\n');
  const out = [];
  let current = null;
  for (const line of lines) {
    const h = line.match(/^##\s+(EN|FR|ES)\b/i);
    if (h) {
      current = h[1].toLowerCase() === lang.toLowerCase() ? lang : null;
      continue;
    }
    if (/^##\s/.test(line)) {
      current = null;
      continue;
    }
    if (current) out.push(line);
  }
  return out
    .join('\n')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/\[(.*?)\]\(.*?\)/g, '$1')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/^[-*]\s+/gm, '')
    .replace(/^#+\s*/gm, '')
    .replace(/^\d+\.\s+/gm, '')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

function chunkText(text, maxBytes = 4500) {
  const words = text.split(/\s+/);
  const chunks = [];
  let current = [];
  let size = 0;
  for (const word of words) {
    const wordSize = Buffer.byteLength(word, 'utf8') + (current.length ? 1 : 0);
    if (current.length && size + wordSize > maxBytes) {
      chunks.push(current.join(' '));
      current = [];
      size = 0;
    }
    current.push(word);
    size += wordSize;
  }
  if (current.length) chunks.push(current.join(' '));
  return chunks;
}

async function synthGoogleCloud(text, voice) {
  const tts = await import('@google-cloud/text-to-speech');
  const TextToSpeechClient =
    (tts.default && tts.default.TextToSpeechClient) || tts.TextToSpeechClient;
  if (!TextToSpeechClient) throw new Error('TextToSpeechClient export not found');
  const client = new TextToSpeechClient();
  const [resp] = await client.synthesizeSpeech({
    input: { text },
    voice: { languageCode: voice.languageCode, name: voice.name },
    audioConfig: { audioEncoding: 'MP3', speakingRate: 0.85, pitch: 0 },
  });
  if (!resp.audioContent) throw new Error('empty audioContent');
  return Buffer.isBuffer(resp.audioContent) ? resp.audioContent : Buffer.from(resp.audioContent);
}

async function synthGoogleTtsApi(text, lang) {
  const g = await import('google-tts-api');
  const googleTTS = g.default || g;
  const urls = googleTTS.getAllAudioUrls(text, { lang, slow: false });
  const buffers = [];
  for (const url of urls) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`google-tts-api fetch failed: ${res.status}`);
    buffers.push(Buffer.from(await res.arrayBuffer()));
  }
  return Buffer.concat(buffers);
}

/** Determine the TTS backend once (GCP if usable, else google-tts-api). */
async function pickTts() {
  try {
    const tts = await import('@google-cloud/text-to-speech');
    const TextToSpeechClient =
      (tts.default && tts.default.TextToSpeechClient) || tts.TextToSpeechClient;
    if (!TextToSpeechClient) throw new Error('no client export');
    const client = new TextToSpeechClient();
    return { name: 'gcp', client };
  } catch (err) {
    console.warn(`  Google Cloud TTS unavailable (${err.message}); using google-tts-api fallback.`);
    return { name: 'google-tts-api' };
  }
}

async function ensureMp3(id, lang, skipTts) {
  const out = path.join(AUDIO_DIR, `${id}-${lang}.mp3`);
  if (fs.existsSync(out)) {
    console.log(`  audio (reused): ${path.relative(ROOT, out)}`);
    return out;
  }
  if (skipTts) throw new Error(`Missing ${path.relative(ROOT, out)} and --skip-tts is set.`);

  const text = extractLanguageScript(id, lang);
  if (!text) throw new Error(`No ${lang.toUpperCase()} script text found for ${id}.`);

  console.log(`  synthesizing ${id} (${lang})… ${text.length} chars`);
  const tts = await pickTts();
  const chunks = chunkText(text, 4500);
  const buffers = [];
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    let buf;
    if (tts.name === 'gcp') {
      buf = await synthGoogleCloud(chunk, VOICES[lang]);
    } else {
      buf = await synthGoogleTtsApi(chunk, lang);
    }
    if (!buf || !buf.length) throw new Error(`TTS produced no audio for chunk ${i}`);
    buffers.push(buf);
    console.log(`    chunk ${i + 1}/${chunks.length} → ${buf.length} bytes`);
  }
  fs.writeFileSync(out, Buffer.concat(buffers));
  console.log(`  generated: ${path.relative(ROOT, out)} (${chunks.length} chunk(s))`);
  return out;
}

function generateBackground() {
  if (fs.existsSync(BACKGROUND)) return;
  ensureDir(ASSETS_DIR);
  execFileSync(
    'ffmpeg',
    [
      '-y',
      '-f',
      'lavfi',
      '-i',
      'color=c=0x0a1a3a:s=1920x1080:d=1',
      '-i',
      LOGO,
      '-filter_complex',
      'overlay=(W-w)/2:(H-h)/2',
      '-frames:v',
      '1',
      BACKGROUND,
    ],
    { stdio: 'inherit' }
  );
  console.log(`background: ${path.relative(ROOT, BACKGROUND)}`);
}

function probeDuration(file) {
  try {
    const out = execFileSync(
      'ffprobe',
      ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file],
      { encoding: 'utf8' }
    );
    const d = parseFloat(out.trim());
    return Number.isFinite(d) ? d : null;
  } catch {
    return null;
  }
}

function buildVideo(id, lang, mp3Path) {
  const dir = outDirFor(lang);
  ensureDir(dir);
  const concat = path.join(dir, 'concat.txt');
  // Write concat.txt (FFmpeg concat list) for reference / multi-chunk use.
  fs.writeFileSync(concat, `file '${mp3Path.replace(/\\/g, '/')}'\n`);
  const out = path.join(dir, `${id}-${lang}.mp4`);
  // Direct -i (single MP3) is more reliable than the concat demuxer for MP3.
  execFileSync(
    'ffmpeg',
    [
      '-y',
      '-loop',
      '1',
      '-i',
      BACKGROUND,
      '-i',
      mp3Path,
      '-c:v',
      'libx264',
      '-preset',
      'veryfast',
      '-crf',
      '23',
      '-pix_fmt',
      'yuv420p',
      '-r',
      '30',
      '-c:a',
      'aac',
      '-b:a',
      '192k',
      '-shortest',
      out,
    ],
    { stdio: 'inherit' }
  );
  const dur = probeDuration(out);
  const label = dur != null ? `${Math.round(dur)}s` : 'unknown';
  if (dur == null || dur < 5) {
    console.warn(`  ⚠  ${path.relative(ROOT, out)} duration=${label} — possible blank video!`);
  } else {
    console.log(`  ✓ ${path.relative(ROOT, out)} (${label})`);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const videos = args.video ? VIDEOS.filter((v) => v.id === args.video) : VIDEOS;
  if (!videos.length) {
    console.error(`Unknown video id: ${args.video}`);
    process.exit(1);
  }
  console.log(
    `Languages: ${args.langs.join(', ')}  |  Videos: ${videos.map((v) => v.id).join(', ')}  |  skip-tts: ${args.skipTts}`
  );
  console.log('Generating background (if needed)...');
  generateBackground();

  let ok = 0;
  let failed = 0;
  for (const v of videos) {
    for (const lang of args.langs) {
      console.log(`\n[${v.id}] ${lang}`);
      try {
        const mp3 = await ensureMp3(v.id, lang, args.skipTts);
        buildVideo(v.id, lang, mp3);
        ok += 1;
      } catch (err) {
        failed += 1;
        console.error(`  ✗ ${err instanceof Error ? err.message : err}`);
      }
    }
  }
  console.log(`\nDone. ${ok} video(s) built, ${failed} failed.`);
  if (failed > 0) process.exitCode = 1;
}

main();
