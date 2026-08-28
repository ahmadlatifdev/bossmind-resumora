/**
 * Generate Resumora Video Library EN masters via existing Veo 3 integration (functions/veo.js).
 *
 * Modes:
 *   --direct  (default) Call Vertex through functions/veo.js using ADC / optional SA JSON env.
 *   --http    POST https://resumora.net/api/video/google-generate (needs FIREBASE_ID_TOKEN + deployed functions).
 *
 * Usage:
 *   node scripts/generate-library-masters-veo.cjs
 *   node scripts/generate-library-masters-veo.cjs --only=vid-resume-writing
 *   set FIREBASE_ID_TOKEN=... && node scripts/generate-library-masters-veo.cjs --http
 *
 * Never prints secret values, tokens, or price IDs.
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const REPO_ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(REPO_ROOT, 'public', 'videos');
const PROJECT = process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT || 'resumora-live';
const BASE_URL = String(process.env.RESUMORA_BASE_URL || 'https://resumora.net').replace(/\/$/, '');

process.env.GOOGLE_CLOUD_PROJECT = PROJECT;
process.env.GCLOUD_PROJECT = PROJECT;
if (!process.env.GCS_BUCKET_NAME && !process.env.VEO_OUTPUT_BUCKET) {
  process.env.GCS_BUCKET_NAME = 'resumora-videos';
}

const VIDEOS = [
  {
    id: 'vid-resume-writing',
    file: 'vid-resume-writing.mp4',
    prompt:
      'A professional, clean 60-second animation explaining the key steps to building a compelling resume for job seekers.',
  },
  {
    id: 'vid-ats-optimization',
    file: 'vid-ats-optimization.mp4',
    prompt:
      'A professional, clean 60-second animation explaining how to optimize a resume to pass Applicant Tracking Systems (ATS).',
  },
  {
    id: 'vid-linkedin-tips',
    file: 'vid-linkedin-tips.mp4',
    prompt:
      'A professional, clean 60-second animation offering practical tips for optimizing a LinkedIn profile to attract recruiters.',
  },
  {
    id: 'vid-interview-prep',
    file: 'vid-interview-prep.mp4',
    prompt:
      'A professional, clean 60-second animation sharing essential strategies for preparing for a job interview.',
  },
];

function parseArgs(argv) {
  const out = { http: false, direct: true, only: null, durationSeconds: 8 };
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
  console.log(`[veo-masters] ${msg}`);
}

async function httpJson(method, url, body, token) {
  const headers = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };
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
      'FIREBASE_ID_TOKEN is required for --http mode (paid-plan Firebase ID token; do not commit it).'
    );
  }
  log(`${item.id}: starting generate via Hosting API…`);
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
    if (started.done && started.videoUrl) return started;
    throw new Error(`${item.id}: no operationName from google-generate`);
  }
  log(`${item.id}: polling status…`);
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
  // Lazy-load CommonJS module from functions/
  // eslint-disable-next-line import/no-dynamic-require, global-require
  const veo = require(path.join(REPO_ROOT, 'functions', 'veo.js'));
  log(`${item.id}: starting generate via functions/veo.js (direct)…`);
  const started = await veo.startVideoGeneration({
    prompt: item.prompt,
    durationSeconds,
    aspectRatio: '16:9',
    resolution: '1080p',
  });
  log(`${item.id}: polling operation…`);
  return veo.pollUntilReady(started.operationName, { maxWaitMs: 600000, intervalMs: 5000 });
}

function downloadWithGcloud(gcsUri, destFile) {
  const r = spawnSync(
    'gcloud',
    ['storage', 'cp', gcsUri, destFile, `--project=${PROJECT}`],
    { encoding: 'utf8', shell: false }
  );
  if (r.status !== 0) {
    throw new Error(
      `gcloud storage cp failed for ${itemSafe(destFile)}: ${(r.stderr || r.stdout || '').slice(0, 200)}`
    );
  }
}

function itemSafe(p) {
  return path.basename(p);
}

async function downloadResult(result, destFile) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  if (result.gcsUri && String(result.gcsUri).startsWith('gs://')) {
    log(`Downloading via gcloud storage cp → ${itemSafe(destFile)}`);
    downloadWithGcloud(result.gcsUri, destFile);
    return;
  }
  if (result.videoUrl && /^https?:\/\//i.test(result.videoUrl)) {
    log(`Downloading via HTTPS → ${itemSafe(destFile)}`);
    const res = await fetch(result.videoUrl);
    if (!res.ok) throw new Error(`Download HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(destFile, buf);
    return;
  }
  throw new Error('No gcsUri or videoUrl on completed result');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const list = args.only ? VIDEOS.filter((v) => v.id === args.only || v.file === args.only) : VIDEOS;
  if (!list.length) {
    throw new Error(`No videos matched --only=${args.only}`);
  }

  log(`Project=${PROJECT} mode=${args.http ? 'http' : 'direct'} out=${OUT_DIR}`);
  log('Note: Veo max clip length is 8s (not full 5:00 library duration).');

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
      log(`SUCCESS created ${dest} (${Math.round(st.size / 1024)} KiB)`);
      successes.push(item.file);
    } catch (err) {
      console.error(`[veo-masters] FAIL ${item.id}: ${err.message}`);
      throw err;
    }
  }

  console.log('');
  console.log('All requested masters ready:');
  for (const f of successes) {
    console.log(`  ✓ ${path.join(OUT_DIR, f)}`);
  }
  console.log('');
  console.log('Next:');
  console.log('  powershell -ExecutionPolicy Bypass -File .\\scripts\\seed-video-library.ps1');
  console.log('  npm run build');
  console.log('  firebase deploy --only hosting --project resumora-live');
}

main().catch((err) => {
  console.error(`[veo-masters] aborted: ${err.message}`);
  process.exit(1);
});
