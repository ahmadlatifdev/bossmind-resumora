#!/usr/bin/env node
/**
 * Prepare platform-specific variants from a Resumora master video.
 *
 * Requires ffmpeg on PATH (winget install Gyan.FFmpeg).
 * Never logs secrets / Stripe price ids.
 *
 * Usage:
 *   node scripts/prepare-platform-videos.mjs --input public/videos/vid-resume-writing.mp4
 *   node scripts/prepare-platform-videos.mjs --input path\to\master.mp4 --id vid-resume-writing --langs en,fr,es
 */

import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROOT = path.resolve(__dirname, '..');
const OUT_ROOT = path.join(ROOT, 'dist-media');
const BRAND_URL = 'resumora.net';
const LOGO_CANDIDATES = [
  path.join(ROOT, 'public', 'favicon.png'),
  path.join(ROOT, 'public', 'resumora-logo.png'),
];

function parseArgs(argv) {
  const out = { input: '', id: '', langs: ['en'], maxShortSec: 60 };
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--input') out.input = argv[++i];
    else if (a === '--id') out.id = argv[++i];
    else if (a === '--langs') out.langs = String(argv[++i] || 'en').split(',').map((s) => s.trim()).filter(Boolean);
    else if (a === '--out') out.out = argv[++i];
    else if (a === '--max-short-sec') out.maxShortSec = Number(argv[++i]) || 60;
  }
  return out;
}

function whichFfmpeg() {
  const r = spawnSync(process.platform === 'win32' ? 'where' : 'which', ['ffmpeg'], {
    encoding: 'utf8',
  });
  if (r.status === 0 && String(r.stdout || '').trim()) return 'ffmpeg';
  return null;
}

function runFfmpeg(args) {
  const r = spawnSync('ffmpeg', ['-y', ...args], { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
  if (r.status !== 0) {
    const err = String(r.stderr || r.stdout || 'ffmpeg failed').slice(-800);
    throw new Error(err);
  }
}

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function vttToSrt(vttText) {
  const lines = String(vttText || '')
    .replace(/\r/g, '')
    .split('\n')
    .filter((l) => !/^WEBVTT/i.test(l) && !/^NOTE\b/.test(l) && l.trim() !== 'STYLE' && !l.startsWith('Style:'));
  const cues = [];
  let i = 0;
  let idx = 1;
  while (i < lines.length) {
    let line = lines[i].trim();
    if (!line) {
      i += 1;
      continue;
    }
    if (/^\d+$/.test(line)) {
      i += 1;
      line = (lines[i] || '').trim();
    }
    const m = line.match(
      /(\d{2}:\d{2}:\d{2}[.,]\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}[.,]\d{3})/
    );
    if (!m) {
      i += 1;
      continue;
    }
    const start = m[1].replace('.', ',');
    const end = m[2].replace('.', ',');
    i += 1;
    const text = [];
    while (i < lines.length && lines[i].trim()) {
      text.push(lines[i]);
      i += 1;
    }
    cues.push(`${idx}\n${start} --> ${end}\n${text.join('\n')}\n`);
    idx += 1;
  }
  return cues.join('\n');
}

function findSubtitles(videoId, lang) {
  const candidates = [
    path.join(ROOT, 'public', 'subtitles', `${videoId}.${lang}.vtt`),
    path.join(ROOT, 'public', 'subtitles', `${videoId}-${lang}.vtt`),
    path.join(ROOT, 'public', 'subtitles', `${videoId}.en.vtt`),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return null;
}

function brandFilter() {
  // Lower-third brand URL; works without a logo file.
  return `drawtext=text='${BRAND_URL}':fontcolor=white@0.92:fontsize=28:x=(w-text_w)/2:y=h-th-36:box=1:boxcolor=black@0.45:boxborderw=8`;
}

function logoOverlayFilter() {
  // Small logo top-right, then brand URL lower-third
  return `[1:v]scale=120:-1[logo];[0:v][logo]overlay=W-w-24:24,${brandFilter()}`;
}

function writeManifest(dir, data) {
  const p = path.join(dir, 'manifest.json');
  fs.writeFileSync(p, JSON.stringify(data, null, 2), 'utf8');
  return p;
}

function main() {
  const args = parseArgs(process.argv);
  if (!args.input) {
    console.error('Usage: node scripts/prepare-platform-videos.mjs --input <master.mp4> [--id vid-id] [--langs en,fr,es]');
    process.exit(1);
  }
  const input = path.resolve(args.input);
  if (!fs.existsSync(input)) {
    console.error(`Input not found: ${input}`);
    process.exit(1);
  }
  if (!whichFfmpeg()) {
    console.error('ffmpeg not found on PATH. Install: winget install --id=Gyan.FFmpeg -e');
    process.exit(1);
  }

  const videoId =
    args.id ||
    path.basename(input, path.extname(input)).replace(/-en$/i, '') ||
    'master';
  const outDir = path.resolve(args.out || path.join(OUT_ROOT, videoId));
  ensureDir(outDir);

  const logoPath = LOGO_CANDIDATES.find((p) => fs.existsSync(p)) || null;
  const brand = brandFilter();
  const shortPath = path.join(outDir, `${videoId}.shorts-9x16.mp4`);
  const landscapePath = path.join(outDir, `${videoId}.landscape-16x9.mp4`);
  const thumbPath = path.join(outDir, `${videoId}.thumb.jpg`);
  const captions = {};

  console.log(JSON.stringify({ scope: 'preparePlatformVideos', step: 'start', videoId, input }));

  // Horizontal 16:9 + brand burn-in
  if (logoPath) {
    runFfmpeg([
      '-i',
      input,
      '-i',
      logoPath,
      '-t',
      '600',
      '-filter_complex',
      logoOverlayFilter(),
      '-c:v',
      'libx264',
      '-preset',
      'veryfast',
      '-crf',
      '23',
      '-c:a',
      'aac',
      '-b:a',
      '128k',
      '-movflags',
      '+faststart',
      landscapePath,
    ]);
  } else {
    runFfmpeg([
      '-i',
      input,
      '-t',
      '600',
      '-vf',
      `scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,${brand}`,
      '-c:v',
      'libx264',
      '-preset',
      'veryfast',
      '-crf',
      '23',
      '-c:a',
      'aac',
      '-b:a',
      '128k',
      '-movflags',
      '+faststart',
      landscapePath,
    ]);
  }
  console.log(JSON.stringify({ scope: 'preparePlatformVideos', step: 'landscape_ok', path: landscapePath }));

  // Vertical 9:16 short (max 60s) — crop/pad center
  runFfmpeg([
    '-i',
    input,
    '-t',
    String(args.maxShortSec),
    '-vf',
    `scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,${brand}`,
    '-c:v',
    'libx264',
    '-preset',
    'veryfast',
    '-crf',
    '23',
    '-c:a',
    'aac',
    '-b:a',
    '128k',
    '-movflags',
    '+faststart',
    shortPath,
  ]);
  console.log(JSON.stringify({ scope: 'preparePlatformVideos', step: 'shorts_ok', path: shortPath }));

  // Thumbnail (LinkedIn / Instagram)
  runFfmpeg(['-i', landscapePath, '-ss', '00:00:02', '-frames:v', '1', '-q:v', '2', thumbPath]);
  console.log(JSON.stringify({ scope: 'preparePlatformVideos', step: 'thumb_ok', path: thumbPath }));

  // Captions: copy VTT + generate SRT per lang
  for (const lang of args.langs) {
    const vttSrc = findSubtitles(videoId, lang);
    if (!vttSrc) {
      console.warn(JSON.stringify({ scope: 'preparePlatformVideos', step: 'captions_missing', lang, videoId }));
      continue;
    }
    const vttOut = path.join(outDir, `${videoId}.${lang}.vtt`);
    const srtOut = path.join(outDir, `${videoId}.${lang}.srt`);
    const raw = fs.readFileSync(vttSrc, 'utf8');
    const brandedVtt = raw.includes(BRAND_URL)
      ? raw
      : `${raw.trim()}\n\nNOTE\nBrand: ${BRAND_URL}\n`;
    fs.writeFileSync(vttOut, brandedVtt, 'utf8');
    fs.writeFileSync(srtOut, vttToSrt(brandedVtt), 'utf8');
    captions[lang] = { vtt: vttOut, srt: srtOut, source: vttSrc };
    console.log(JSON.stringify({ scope: 'preparePlatformVideos', step: 'captions_ok', lang }));
  }

  const localeEn = (() => {
    try {
      return JSON.parse(fs.readFileSync(path.join(ROOT, 'locales', 'en.json'), 'utf8'));
    } catch {
      return {};
    }
  })();
  const title =
    localeEn[`publish.${videoId}.title`] || videoId.replace(/^vid-/, '').replace(/-/g, ' ');
  const description =
    localeEn[`publish.${videoId}.description`] ||
    `${title} — career tips from Resumora. Watch more at https://${BRAND_URL}`;
  const tags = String(localeEn[`publish.${videoId}.tags`] || 'Resumora,resume,career,jobsearch')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .concat([BRAND_URL]);

  const manifest = {
    videoId,
    brandUrl: `https://${BRAND_URL}`,
    master: input,
    generatedAt: new Date().toISOString(),
    platforms: {
      youtube: { file: landscapePath, aspect: '16:9', captionsPrefer: 'vtt' },
      facebook: { file: landscapePath, aspect: '16:9', captionsPrefer: 'srt' },
      linkedin: { file: landscapePath, thumbnail: thumbPath, aspect: '16:9' },
      instagram: { file: shortPath, thumbnail: thumbPath, aspect: '9:16', maxSeconds: args.maxShortSec },
      tiktok: { file: shortPath, aspect: '9:16', maxSeconds: args.maxShortSec },
      shorts: { file: shortPath, aspect: '9:16', maxSeconds: args.maxShortSec },
      bilibili: {
        file: landscapePath,
        aspect: '16:9',
        note: 'Upload via GCS bilibili-outbox/ or distribute-outbox/; enable AI translation / AI Voice in Bilibili creator tools for ZH localization.',
      },
      x: { file: shortPath, aspect: '9:16', maxSeconds: args.maxShortSec },
    },
    metadata: {
      title,
      description,
      tags,
      captions,
    },
  };

  const manifestPath = writeManifest(outDir, manifest);
  console.log(
    JSON.stringify({
      scope: 'preparePlatformVideos',
      step: 'done',
      outDir,
      manifestPath,
    })
  );
  console.log(`\nNext: upload variants to gs://resumora-videos/distribute-outbox/${videoId}/ then deploy distributeMasterVideo.`);
}

main();
