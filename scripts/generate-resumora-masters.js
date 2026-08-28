/**
 * Generate Resumora Video Library EN masters via Veo 3.
 *
 * Primary: POST /api/video/google-generate + poll /api/video/google-status
 * Fallback: --direct uses functions/veo.js (Vertex) with gcloud token / SA JSON env.
 *
 * Usage:
 *   $env:FIREBASE_ID_TOKEN = '<paid-plan Firebase ID token>'   # do not commit
 *   node scripts/generate-resumora-masters.js
 *   node scripts/generate-resumora-masters.js --direct
 *   node scripts/generate-resumora-masters.js --only=vid-resume-writing
 *
 * Never prints secret values, tokens, or price IDs.
 *
 * Note: Vertex Veo durationSeconds is 4|6|8 only (script uses 8). Prompts may say 60s.
 */

import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(REPO_ROOT, 'public', 'videos');
const PROJECT = process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT || 'resumora-live';
const BASE_URL = String(process.env.RESUMORA_BASE_URL || 'https://resumora.net').replace(/\/$/, '');

process.env.GOOGLE_CLOUD_PROJECT = PROJECT;
process.env.GCLOUD_PROJECT = PROJECT;
if (!process.env.GCS_BUCKET_NAME && !process.env.VEO_OUTPUT_BUCKET) {
  process.env.GCS_BUCKET_NAME = 'resumora-videos';
}
if (!process.env.VEO_MODEL_ID) {
  process.env.VEO_MODEL_ID = 'veo-3.1-fast-generate-001';
}
if (!process.env.VEO_LOCATION) {
  process.env.VEO_LOCATION = 'us-central1';
}

const VIDEOS = [
  {
    id: 'vid-resume-writing',
    file: 'vid-resume-writing.mp4',
    prompt: 'Professional 60-second animation on structuring a resume.',
  },
  {
    id: 'vid-ats-optimization',
    file: 'vid-ats-optimization.mp4',
    prompt: 'Professional 60-second animation on ATS optimization.',
  },
  {
    id: 'vid-linkedin-tips',
    file: 'vid-linkedin-tips.mp4',
    prompt: 'Professional 60-second animation on optimizing a LinkedIn profile.',
  },
  {
    id: 'vid-interview-prep',
    file: 'vid-interview-prep.mp4',
    prompt: 'Professional 60-second animation on job interview preparation.',
  },
];

function parseArgs(argv) {
  const hasToken = Boolean(String(process.env.FIREBASE_ID_TOKEN || '').trim());
  const out = {
    // Prefer HTTP when token present; otherwise direct Vertex via veo.js
    http: hasToken,
    direct: !hasToken,
    only: null,
    durationSeconds: 8,
  };
  for (const a of argv) {
    if (a === '--http') {
      out.http = true;
      out.direct = false;
    } else if (a === '--direct') {
      out.direct = true;
      out.http = false;
    } else if (a.startsWith('--only=')) {
      out.only = a.slice('--only='.length).trim();
    } else if (a.startsWith('--duration=')) {
      const n = Number(a.slice('--duration='.length));
      if ([4, 6, 8].includes(n)) out.durationSeconds = n;
    }
  }
  return out;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function log(msg) {
  console.log(`[generate-resumora-masters] ${msg}`);
}

async function httpJson(method, url, body, token) {
  const headers = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `HTTP ${res.status}`);
    err.status = res.status;
    err.code = data.code || null;
    throw err;
  }
  return data;
}

async function generateViaHttp(item, durationSeconds) {
  const token = String(process.env.FIREBASE_ID_TOKEN || '').trim();
  if (!token) {
    throw new Error(
      'FIREBASE_ID_TOKEN is required for HTTP mode (paid-plan Firebase ID token; do not commit it).'
    );
  }
  log(`${item.id}: POST ${BASE_URL}/api/video/google-generate`);
  const started = await httpJson(
    'POST',
    `${BASE_URL}/api/video/google-generate`,
    {
      prompt: item.prompt,
      async: true,
      wait: false,
      durationSeconds,
      aspectRatio: '16:9',
      resolution: '1080p',
    },
    token
  );
  const operationName = started.operationName;
  if (!operationName) {
    if (started.done && (started.videoUrl || started.gcsUri)) return started;
    throw new Error(`${item.id}: no operationName from google-generate`);
  }
  log(`${item.id}: polling google-status …`);
  let delay = 5000;
  for (let i = 0; i < 90; i += 1) {
    const status = await httpJson(
      'GET',
      `${BASE_URL}/api/video/google-status?operationName=${encodeURIComponent(operationName)}`,
      null,
      token
    );
    if (status.done && (status.videoUrl || status.gcsUri)) return status;
    if (status.status === 'failed' || status.error) {
      throw new Error(status.error || `${item.id}: Veo failed`);
    }
    await sleep(delay);
    delay = Math.min(15000, Math.round(delay * 1.2));
  }
  throw new Error(`${item.id}: timed out waiting for Veo`);
}

async function generateViaDirect(item, durationSeconds) {
  const veo = require(path.join(REPO_ROOT, 'functions', 'veo.js'));
  log(`${item.id}: functions/veo.js startVideoGeneration …`);
  const started = await veo.startVideoGeneration({
    prompt: item.prompt,
    durationSeconds,
    aspectRatio: '16:9',
    resolution: '1080p',
  });
  log(`${item.id}: pollUntilReady …`);
  return veo.pollUntilReady(started.operationName, { maxWaitMs: 600000, intervalMs: 5000 });
}

function downloadWithGcloud(gcsUri, destFile) {
  const bin = process.platform === 'win32' ? 'gcloud.cmd' : 'gcloud';
  const r = spawnSync(bin, ['storage', 'cp', gcsUri, destFile, `--project=${PROJECT}`], {
    encoding: 'utf8',
    shell: true,
  });
  if (r.status !== 0) {
    throw new Error(
      `gcloud storage cp failed for ${path.basename(destFile)}: ${(r.stderr || r.stdout || '').slice(0, 200)}`
    );
  }
}

async function downloadResult(result, destFile) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  if (result.gcsUri && String(result.gcsUri).startsWith('gs://')) {
    log(`Downloading → ${path.basename(destFile)}`);
    downloadWithGcloud(result.gcsUri, destFile);
    return;
  }
  if (result.videoUrl && /^https?:\/\//i.test(result.videoUrl)) {
    log(`Downloading HTTPS → ${path.basename(destFile)}`);
    const res = await fetch(result.videoUrl);
    if (!res.ok) throw new Error(`Download HTTP ${res.status}`);
    fs.writeFileSync(destFile, Buffer.from(await res.arrayBuffer()));
    return;
  }
  throw new Error('No gcsUri or videoUrl on completed result');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const list = args.only
    ? VIDEOS.filter((v) => v.id === args.only || v.file === args.only)
    : VIDEOS;
  if (!list.length) throw new Error(`No videos matched --only=${args.only}`);

  log(`Project=${PROJECT} mode=${args.http ? 'http' : 'direct'} out=${OUT_DIR}`);
  log('Veo durationSeconds capped at 4|6|8 (using 8).');

  const successes = [];
  for (const item of list) {
    const dest = path.join(OUT_DIR, item.file);
    try {
      const result = args.http
        ? await generateViaHttp(item, args.durationSeconds)
        : await generateViaDirect(item, args.durationSeconds);
      await downloadResult(result, dest);
      const st = fs.statSync(dest);
      if (st.size < 1000) throw new Error('Downloaded file too small');
      console.log(`SUCCESS created ${dest} (${Math.round(st.size / 1024)} KiB)`);
      successes.push(item.file);
    } catch (err) {
      console.error(`FAIL ${item.id}: ${err.message}`);
      throw err;
    }
  }

  console.log('');
  console.log('All requested masters ready:');
  for (const f of successes) {
    console.log(`  ${path.join(OUT_DIR, f)}`);
  }
  console.log('');
  console.log('Next: node scripts/seed-firestore-videos.js');
}

main().catch((err) => {
  console.error(`aborted: ${err.message}`);
  process.exit(1);
});
