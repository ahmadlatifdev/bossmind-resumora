#!/usr/bin/env node
/**
 * Generate i18n videos end-to-end:
 *   1. Read script text (docs/interview-series/<id>.md)
 *   2. TTS → MP3 (Google Cloud Text-to-Speech; reuses existing audio/<id>-<lang>.mp3)
 *   3. Write a concat.txt (FFmpeg concat demuxer list)
 *   4. FFmpeg: loop static brand background + audio → 1080p H.264 MP4
 *
 * Output: assets/vid-star-conversational-build-<LANG>/<id>-<lang>.mp4
 *
 * Requirements: FFmpeg on PATH, GCP credentials for TTS (only when audio is missing).
 * Usage: node scripts/generate-i18n-videos.js [--lang en,fr,es] [--skip-tts]
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
  const args = { langs: ALL_LANGS, skipTts: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--lang' && argv[i + 1]) args.langs = argv[++i].split(',').map((s) => s.trim());
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

function readScriptText(id) {
  const p = path.join(SCRIPTS_DIR, `${id}.md`);
  if (!fs.existsSync(p)) return '';
  let text = fs.readFileSync(p, 'utf8');
  text = text
    .replace(/^#.*$/gm, '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\[(.*?)\]\(.*?\)/g, '$1')
    .replace(/## Production Notes[\s\S]*/i, '')
    .replace(/\n{2,}/g, '\n')
    .trim();
  return text;
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

/** Generate a single navy 1920x1080 background with the logo centered (once). */
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

/** Ensure MP3 exists; generate via Google Cloud TTS when missing. */
async function ensureMp3(id, lang, skipTts) {
  const out = path.join(AUDIO_DIR, `${id}-${lang}.mp3`);
  if (fs.existsSync(out)) {
    console.log(`  audio (reused): ${path.relative(ROOT, out)}`);
    return out;
  }
  if (skipTts) {
    throw new Error(`Missing ${path.relative(ROOT, out)} and --skip-tts is set.`);
  }

  const text = readScriptText(id);
  if (!text) throw new Error(`No script text found for ${id} (docs/interview-series/${id}.md).`);

  console.log(`  synthesizing audio for ${id} (${lang})...`);
  let TextToSpeechClient;
  try {
    const tts = await import('@google-cloud/text-to-speech');
    TextToSpeechClient = (tts.default && tts.default.TextToSpeechClient) || tts.TextToSpeechClient;
  } catch (err) {
    throw new Error(
      `@google-cloud/text-to-speech not available (${err.message}). ` +
        'Run `npm i @google-cloud/text-to-speech` or generate audio via scripts/generate-audio.py.'
    );
  }
  if (!TextToSpeechClient) {
    throw new Error('TextToSpeechClient export not found in @google-cloud/text-to-speech.');
  }

  let client;
  try {
    client = new TextToSpeechClient();
  } catch (err) {
    throw new Error(
      `TTS client init failed (check GOOGLE_APPLICATION_CREDENTIALS): ${err.message}`
    );
  }

  const voice = VOICES[lang];
  const buffers = [];
  for (const [i, chunk] of chunkText(text).entries()) {
    try {
      const [resp] = await client.synthesizeSpeech({
        input: { text: chunk },
        voice: { languageCode: voice.languageCode, name: voice.name },
        audioConfig: { audioEncoding: 'MP3', speakingRate: 0.85, pitch: 0 },
      });
      if (!resp.audioContent) throw new Error('empty audioContent');
      buffers.push(resp.audioContent);
    } catch (err) {
      throw new Error(
        `TTS failed for ${id}-${lang} chunk ${i} (voice ${voice.name}): ${err.message}`
      );
    }
  }
  fs.writeFileSync(out, Buffer.concat(buffers));
  console.log(`  generated: ${path.relative(ROOT, out)}`);
  return out;
}

/** Write concat.txt + FFmpeg stitch (background + audio → MP4). */
function buildVideo(id, lang, mp3Path) {
  const dir = outDirFor(lang);
  ensureDir(dir);
  const concat = path.join(dir, 'concat.txt');
  fs.writeFileSync(concat, `file '${mp3Path.replace(/\\/g, '/')}'\n`);
  const out = path.join(dir, `${id}-${lang}.mp4`);
  execFileSync(
    'ffmpeg',
    [
      '-y',
      '-loop',
      '1',
      '-i',
      BACKGROUND,
      '-f',
      'concat',
      '-safe',
      '0',
      '-i',
      concat,
      '-c:v',
      'libx264',
      '-preset',
      'medium',
      '-crf',
      '20',
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
  console.log(`  ✓ ${path.relative(ROOT, out)}`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  console.log(`Languages: ${args.langs.join(', ')}  |  skip-tts: ${args.skipTts}`);
  console.log('Generating background (if needed)...');
  generateBackground();

  let ok = 0;
  let failed = 0;
  for (const v of VIDEOS) {
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
