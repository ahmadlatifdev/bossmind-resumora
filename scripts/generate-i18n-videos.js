#!/usr/bin/env node
/**
 * Generate dynamic, conversational i18n videos (100% open-source: Node + FFmpeg).
 *
 * Pipeline:
 *   1. Extract PER-LANGUAGE narration from docs/interview-series/<id>.md
 *   2. Split into conversational turns (alternating Interviewer / Candidate)
 *   3. Time the turns proportionally over the audio duration (approx sync)
 *   4. Generate a styled .ass subtitle track (bold, bottom-center, drop shadow)
 *   5. FFmpeg render: solid navy base → alternating lighter-navy background per
 *      Candidate turn (drawbox) → Resumora logo (top-right) → burned .ass subtitles
 *   6. Verify output duration with ffprobe
 *
 * Output: assets/vid-star-conversational-build-<LANG>/<id>-<lang>.mp4
 *
 * Usage:
 *   node scripts/generate-i18n-videos.js
 *   node scripts/generate-i18n-videos.js --lang en
 *   node scripts/generate-i18n-videos.js --video 02-star-behavioral --lang en
 *   node scripts/generate-i18n-videos.js --skip-tts
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = process.cwd();
const AUDIO_DIR = path.join(ROOT, 'audio');
const SCRIPTS_DIR = path.join(ROOT, 'docs', 'interview-series');
const LOGO = path.join(ROOT, 'public', 'resumora-logo.png');
const ASSETS_DIR = path.join(ROOT, 'assets');
const SOLID_BG = path.join(ASSETS_DIR, 'resumora-solid-bg.png');

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

// Background colors (navy shades) — Interviewer = dark, Candidate = lighter.
const INTERVIEWER_COLOR = '0x0a1a3a';
const CANDIDATE_COLOR = '0x16233f';
const CANDIDATE_TEXT_COLOR = '&H00D9B36A'; // gold-ish for the CANDIDATE label
const INTERVIEWER_TEXT_COLOR = '&H007FD4F0'; // light blue for the INTERVIEWER label
const BODY_TEXT_COLOR = '&H00FFFFFF'; // white

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

/** Extract the text for one language from the multi-language .md script. */
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
    .replace(/[ \t]+/g, ' ')
    .trim();
}

/** Split narration into sentences, then into alternating Interviewer/Candidate turns. */
function splitTurns(text) {
  const sentences = text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const turns = [];
  for (let i = 0; i < sentences.length; i++) {
    turns.push({
      speaker: i % 2 === 0 ? 'Interviewer' : 'Candidate',
      text: sentences[i],
    });
  }
  return turns;
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

/** Distribute turn timings proportionally over the audio duration. */
function assignTimings(turns, audioDuration) {
  const totalChars = turns.reduce((sum, t) => sum + t.text.length, 0) || 1;
  let cursor = 0;
  return turns.map((t) => {
    const dur = Math.max(0.6, (t.text.length / totalChars) * audioDuration);
    const start = cursor;
    const end = Math.min(audioDuration, cursor + dur);
    cursor = end;
    return { ...t, start, end };
  });
}

function toAssTime(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = (sec % 60).toFixed(2).padStart(5, '0');
  return `${h}:${String(m).padStart(2, '0')}:${s}`;
}

function escapeAss(text) {
  return String(text).replace(/\\/g, '\\\\').replace(/\{/g, '\\{').replace(/\}/g, '\\}');
}

function wrapAssText(text, maxLen = 52) {
  const words = escapeAss(text).split(' ');
  const lines = [];
  let line = '';
  for (const w of words) {
    if ((line + ' ' + w).trim().length > maxLen && line) {
      lines.push(line.trim());
      line = w;
    } else {
      line = (line ? line + ' ' : '') + w;
    }
  }
  if (line.trim()) lines.push(line.trim());
  return lines.join('\\N');
}

/** Build a styled .ass subtitle track with speaker labels + alternating colors. */
function buildAss(turns) {
  const header = `[Script Info]
ScriptType: v4.00+
PlayResX: 1920
PlayResY: 1080
WrapStyle: 2
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial,50,&H00FFFFFF,&H00FFFFFF,&H00101010,&H96000000,-1,0,0,0,100,100,0,0,1,3,2,2,80,80,64,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;
  const lines = turns.map((t) => {
    const color = t.speaker === 'Interviewer' ? INTERVIEWER_TEXT_COLOR : CANDIDATE_TEXT_COLOR;
    const body = wrapAssText(t.text);
    const text = `{\\c${color}\\b1}${t.speaker.toUpperCase()}: {\\c${BODY_TEXT_COLOR}\\b0}${body}`;
    return `Dialogue: 0,${toAssTime(t.start)},${toAssTime(t.end)},Default,,0,0,0,,${text}`;
  });
  return header + lines.join('\n') + '\n';
}

/** Generate a solid navy 1920x1080 base (no logo — logo is overlaid separately). */
function generateSolidBackground() {
  if (fs.existsSync(SOLID_BG)) return;
  ensureDir(ASSETS_DIR);
  execFileSync(
    'ffmpeg',
    [
      '-y',
      '-f',
      'lavfi',
      '-i',
      `color=c=${INTERVIEWER_COLOR}:s=1920x1080:d=1`,
      '-frames:v',
      '1',
      SOLID_BG,
    ],
    { stdio: 'inherit' }
  );
  console.log(`solid background: ${path.relative(ROOT, SOLID_BG)}`);
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
    let buf;
    if (tts.name === 'gcp') buf = await synthGoogleCloud(chunks[i], VOICES[lang]);
    else buf = await synthGoogleTtsApi(chunks[i], lang);
    if (!buf || !buf.length) throw new Error(`TTS produced no audio for chunk ${i}`);
    buffers.push(buf);
    console.log(`    chunk ${i + 1}/${chunks.length} → ${buf.length} bytes`);
  }
  fs.writeFileSync(out, Buffer.concat(buffers));
  console.log(`  generated: ${path.relative(ROOT, out)}`);
  return out;
}

function buildVideo(id, lang, mp3Path) {
  const dir = outDirFor(lang);
  ensureDir(dir);
  const out = path.join(dir, `${id}-${lang}.mp4`);
  const assFile = path.join(dir, `${id}-${lang}.ass`);

  const audioDuration = probeDuration(mp3Path) || 480;
  const turns = assignTimings(splitTurns(extractLanguageScript(id, lang)), audioDuration);
  fs.writeFileSync(assFile, buildAss(turns));

  // drawbox for each Candidate turn (lighter navy) on top of the dark base.
  const candidateBoxes = turns
    .filter((t) => t.speaker === 'Candidate')
    .map(
      (t) =>
        `drawbox=x=0:y=0:w=iw:h=ih:color=${CANDIDATE_COLOR}:t=fill:enable='between(t,${t.start.toFixed(3)},${t.end.toFixed(3)})'`
    )
    .join(',');

  const assRel = path.relative(ROOT, assFile).replace(/\\/g, '/');
  const filter = [
    `[0:v]${candidateBoxes ? ',' + candidateBoxes : ''}[bg]`,
    '[1:v]scale=180:180:force_original_aspect_ratio=decrease[logo]',
    '[bg][logo]overlay=W-w-48:40:shortest=0[withlogo]',
    `[withlogo]ass=${assRel}[outv]`,
  ].join(';');

  execFileSync(
    'ffmpeg',
    [
      '-y',
      '-loop',
      '1',
      '-i',
      SOLID_BG,
      '-loop',
      '1',
      '-i',
      LOGO,
      '-i',
      mp3Path,
      '-filter_complex',
      filter,
      '-map',
      '[outv]',
      '-map',
      '2:a',
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
    console.log(`  ✓ ${path.relative(ROOT, out)} (${label}, ${turns.length} turns)`);
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
  console.log('Generating solid background (if needed)...');
  generateSolidBackground();

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
