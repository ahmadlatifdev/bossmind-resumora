#!/usr/bin/env node
/**
 * Render interview videos via a Serverless Video API (JSON2Video v2 template).
 *
 * Flow per role:
 *   1. Read the Whisper transcript (pipeline/assets/transcripts/<role>_transcript.json).
 *   2. Build a movie payload: dark-blue background, public audio URL, gold text
 *      overlays (grouped into phrases, timed).
 *   3. POST to the API → get a project id.
 *   4. Poll every 5s until status === "done" (or "failed" / timeout).
 *   5. Download the final MP4 into pipeline/outputs/<role>.mp4.
 *
 * Required env (see pipeline/.env.example):
 *   JSON2VIDEO_API_KEY   — your API key (x-api-key header)
 *   AUDIO_BASE_URL       — public base URL of the audio files (Firebase Storage / GCS)
 *                          e.g. https://storage.googleapis.com/<bucket>/audio
 *
 * Usage: node pipeline/scripts/render_via_api.js [role ...]
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PIPELINE_DIR = path.resolve(__dirname, '..');
const TRANSCRIPTS_DIR = path.join(PIPELINE_DIR, 'assets', 'transcripts');
const OUTPUTS_DIR = path.join(PIPELINE_DIR, 'outputs');

const API_BASE = (
  process.env.JSON2VIDEO_API_BASE || 'https://api.json2video.com/v2/movies'
).replace(/\/$/, '');
const API_KEY = process.env.JSON2VIDEO_API_KEY || '';
const AUDIO_BASE_URL = (process.env.AUDIO_BASE_URL || '').replace(/\/$/, '');

const ROLES = ['software_engineer', 'data_scientist', 'product_manager', 'marketing_manager'];
const POLL_INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS || 5000);
const TIMEOUT_MS = Number(process.env.RENDER_TIMEOUT_MS || 30 * 60 * 1000);

const BACKGROUND = '#0A1A3A';
const GOLD = '#D4AF37';

async function request(url, options = {}, timeoutMs = 30000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ${url}: ${JSON.stringify(data).slice(0, 300)}`);
    }
    return data;
  } catch (err) {
    if (err.name === 'AbortError') throw new Error(`Timed out calling ${url}`);
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

function apiHeaders() {
  return { 'Content-Type': 'application/json', 'x-api-key': API_KEY };
}

function groupWords(words, maxWords = 5, maxDuration = 3.0) {
  const groups = [];
  let current = [];
  for (const w of words) {
    if (current.length) {
      const gap = w.start - current[0].start;
      if (current.length >= maxWords || gap >= maxDuration) {
        groups.push(current);
        current = [];
      }
    }
    current.push(w);
  }
  if (current.length) groups.push(current);
  return groups;
}

function buildPayload(role, words, audioUrl) {
  const phrases = groupWords(words);
  const elements = [{ type: 'audio', src: audioUrl, duration: -1 }];
  for (const phrase of phrases) {
    const text = phrase
      .map((w) => w.word)
      .join(' ')
      .trim();
    if (!text) continue;
    const duration = Math.max(0.5, (phrase[phrase.length - 1].end - phrase[0].start).toFixed(2));
    elements.push({
      type: 'text',
      text,
      duration: Number(duration),
      style: '003', // TODO: pick a JSON2Video text style that renders large/gold,
      // or set custom settings below when supported:
      // settings: { font_color: GOLD, font_size: 64, x: 'center', y: 'bottom' },
    });
  }
  return {
    resolution: 'full-hd',
    quality: 'high',
    background: BACKGROUND,
    draft: false,
    scenes: [{ comment: `Resumora interview — ${role}`, elements }],
  };
}

async function createMovie(payload) {
  const data = await request(
    API_BASE,
    {
      method: 'POST',
      headers: apiHeaders(),
      body: JSON.stringify(payload),
    },
    60000
  );
  if (!data.success || !data.project) {
    throw new Error(`API rejected payload: ${JSON.stringify(data).slice(0, 400)}`);
  }
  return data.project;
}

async function getMovie(projectId) {
  return request(
    `${API_BASE}?project=${encodeURIComponent(projectId)}`,
    {
      headers: { 'x-api-key': API_KEY },
    },
    20000
  );
}

async function pollUntilDone(projectId) {
  const deadline = Date.now() + TIMEOUT_MS;
  for (;;) {
    const data = await getMovie(projectId);
    const movie = data.movie || {};
    const status = String(movie.status || '').toLowerCase();
    if (status === 'done' || status === 'completed') return movie;
    if (status === 'failed' || status === 'error') {
      throw new Error(`Render failed: ${JSON.stringify(movie).slice(0, 400)}`);
    }
    if (Date.now() > deadline) {
      throw new Error(`Timed out waiting for project ${projectId} (${TIMEOUT_MS}ms)`);
    }
    console.log(`  … status="${status || 'pending'}" — waiting ${POLL_INTERVAL_MS / 1000}s`);
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
}

async function downloadMovie(url, dest) {
  const res = await fetch(url, { signal: AbortSignal.timeout(120000) });
  if (!res.ok) throw new Error(`Download failed (${res.status}): ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(dest, buf);
}

async function renderRole(role) {
  const transcriptPath = path.join(TRANSCRIPTS_DIR, `${role}_transcript.json`);
  if (!fs.existsSync(transcriptPath)) {
    console.warn(`[WARN] ${role}: no transcript — run generate_timestamps.py first`);
    return false;
  }
  const { words } = JSON.parse(fs.readFileSync(transcriptPath, 'utf8'));
  if (!words || !words.length) {
    console.warn(`[WARN] ${role}: transcript has no words`);
    return false;
  }
  const audioUrl = `${AUDIO_BASE_URL}/${role}_combined.mp3`;

  console.log(`\n[RENDER] ${role} (${words.length} words)`);
  const payload = buildPayload(role, words, audioUrl);
  const projectId = await createMovie(payload);
  console.log(`  project: ${projectId}`);

  const movie = await pollUntilDone(projectId);
  const movieUrl = movie.url || movie.mp4 || movie.download_url;
  if (!movieUrl)
    throw new Error(`No download URL in movie: ${JSON.stringify(movie).slice(0, 300)}`);

  fs.mkdirSync(OUTPUTS_DIR, { recursive: true });
  const dest = path.join(OUTPUTS_DIR, `${role}.mp4`);
  await downloadMovie(movieUrl, dest);
  console.log(`[OK] ${dest} (${fs.statSync(dest).size} bytes)`);
  return true;
}

async function main() {
  if (!API_KEY) {
    console.error('[ERROR] JSON2VIDEO_API_KEY is not set.');
    console.error('  set JSON2VIDEO_API_KEY=<your-key>');
    process.exit(1);
  }
  if (!AUDIO_BASE_URL) {
    console.error('[ERROR] AUDIO_BASE_URL is not set (public URL prefix of the audio files).');
    process.exit(1);
  }

  const requested = process.argv.slice(2);
  const roles = requested.length ? requested : ROLES;

  let ok = 0;
  for (const role of roles) {
    try {
      if (await renderRole(role)) ok += 1;
    } catch (err) {
      console.error(`[ERROR] ${role}: ${err.message}`);
    }
  }
  console.log(`\nDone. ${ok}/${roles.length} video(s) rendered.`);
  if (ok < roles.length) process.exitCode = 1;
}

main();
