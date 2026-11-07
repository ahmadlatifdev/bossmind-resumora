#!/usr/bin/env node
/**
 * Fully automated, hands-free conversational video pipeline:
 *
 *   1. Parse an alternating Coach/Interviewer ↔ Job Seeker/Candidate dialogue
 *      from a local Markdown file.
 *   2. POST https://api.heygen.com/v3/videos — type "studio", 1080p / 16:9,
 *      with the correct avatar_id + voice_id per speaker.
 *   3. Poll the HeyGen API until rendering status === "completed".
 *   4. Download the final MP4 locally.
 *   5. Upload the MP4 to Cloudflare R2 (resumora-videos) via @aws-sdk/client-s3.
 *      (Firebase Storage is NOT used.)
 *   6. Upsert the Firestore `videos` collection with metadata whose `url` is
 *      `r2://<bucket>/<filename>.mp4` for the frontend secureAssetUrl resolver.
 *
 * ── Env (place in the repo-root .env, or export before running) ────────────
 *   HEYGEN_API_KEY              HeyGen API key
 *   HEYGEN_INTERVIEWER_AVATAR   avatar_id for Coach / Interviewer
 *   HEYGEN_INTERVIEWER_VOICE    voice_id for Coach / Interviewer
 *   HEYGEN_CANDIDATE_AVATAR     avatar_id for Job Seeker / Candidate
 *   HEYGEN_CANDIDATE_VOICE      voice_id for Job Seeker / Candidate
 *
 *   R2_ACCOUNT_ID               Cloudflare account id (or CLOUDFLARE_ACCOUNT_ID)
 *   R2_ACCESS_KEY_ID            R2 S3 access key id
 *   R2_SECRET_ACCESS_KEY        R2 S3 secret access key
 *   R2_BUCKET                   (optional, default "resumora-videos")
 *   R2_ENDPOINT                 (optional, default https://<account>.r2.cloudflarestorage.com)
 *
 *   GOOGLE_APPLICATION_CREDENTIALS  (optional) service-account JSON for Firestore
 *   FIREBASE_PROJECT_ID             (optional, default "resumora-live")
 *
 * ── Install once ───────────────────────────────────────────────────────────
 *   npm install @aws-sdk/client-s3 firebase-admin
 *
 * ── Usage ──────────────────────────────────────────────────────────────────
 *   node pipeline/scripts/heygen-pipeline.js [path/to/dialogue.md]
 *   (default: docs/interview-series/01_build_strong_resume.md)
 */

import { loadEnvFile } from 'node:process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const PIPELINE_DIR = path.resolve(__dirname, '..');
const OUTPUTS_DIR = path.join(PIPELINE_DIR, 'outputs');
const DEFAULT_SCRIPT = path.join(
  REPO_ROOT,
  'docs',
  'interview-series',
  '01_build_strong_resume.md'
);

// Load the repo-root .env explicitly so the script works regardless of cwd.
try {
  loadEnvFile(path.join(REPO_ROOT, '.env'));
} catch (err) {
  console.warn(`[env] could not load .env (${err.code || err.message}); using process env`);
}

const HEYGEN_BASE = 'https://api.heygen.com';
const HEYGEN_V3_VIDEOS = `${HEYGEN_BASE}/v3/videos`;

const FILENAME = process.env.OUTPUT_FILENAME || 'final_interview.mp4';
const VIDEO_ID = process.env.VIDEO_ID || 'vid-resume-to-interview';
const R2_BUCKET = process.env.R2_BUCKET || 'resumora-videos';
const FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'resumora-live';

const POLL_INTERVAL_MS = 15000;
const POLL_TIMEOUT_MS = 2 * 60 * 60 * 1000; // 2 hours max

/** Return the first non-empty env var among the given names. */
function env(...names) {
  for (const name of names) {
    const value = (process.env[name] || '').trim();
    if (value) return value;
  }
  return '';
}

const HEYGEN_API_KEY = env('HEYGEN_API_KEY');
const INTERVIEWER_AVATAR = env('HEYGEN_INTERVIEWER_AVATAR');
const INTERVIEWER_VOICE = env('HEYGEN_INTERVIEWER_VOICE');
const CANDIDATE_AVATAR = env('HEYGEN_CANDIDATE_AVATAR');
const CANDIDATE_VOICE = env('HEYGEN_CANDIDATE_VOICE');

const R2_ACCOUNT_ID = env('R2_ACCOUNT_ID', 'CLOUDFLARE_ACCOUNT_ID');
const R2_ACCESS_KEY_ID = env('R2_ACCESS_KEY_ID', 'R2_ACCESS_KEY', 'AWS_ACCESS_KEY_ID');
const R2_SECRET_ACCESS_KEY = env('R2_SECRET_ACCESS_KEY', 'R2_SECRET_KEY', 'AWS_SECRET_ACCESS_KEY');
const R2_ENDPOINT =
  env('R2_ENDPOINT', 'CLOUDFLARE_R2_ENDPOINT') ||
  (R2_ACCOUNT_ID ? `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com` : '');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Minimal fetch wrapper with timeout + JSON parsing + clear errors. */
async function request(url, options = {}, timeoutMs = 60000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    const text = await res.text();
    let data;
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = { raw: text.slice(0, 300) };
    }
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ${url}: ${JSON.stringify(data).slice(0, 400)}`);
    }
    return data;
  } catch (err) {
    if (err?.name === 'AbortError') throw new Error(`Timed out calling ${url}`);
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Parse "Speaker: line" turns. Accepts both the canonical labels used in the
 * repo ("Coach", "Job Seeker") and the generic ones ("Interviewer", "Candidate").
 */
function parseDialogue(text) {
  const speakerMap = {
    coach: 'Interviewer',
    interviewer: 'Interviewer',
    'job seeker': 'Candidate',
    job_seeker: 'Candidate',
    candidate: 'Candidate',
  };

  const turns = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const match = line.match(/^\s*(Coach|Interviewer|Job Seeker|Candidate)\s*:\s*(.+)\s*$/i);
    if (!match) continue;
    const speaker = speakerMap[match[1].toLowerCase()];
    const content = match[2].trim();
    if (!speaker || !content) continue;
    turns.push({ speaker, text: content });
  }
  return turns;
}

/** Build the HeyGen v3 "studio" payload (1080p / 16:9). */
function buildPayload(turns) {
  return {
    type: 'studio',
    format: 'mp4',
    dimension: { width: 1920, height: 1080 }, // 1080p, 16:9
    scenes: turns.map((turn) => ({
      character: {
        type: 'avatar',
        avatar_id: turn.speaker === 'Interviewer' ? INTERVIEWER_AVATAR : CANDIDATE_AVATAR,
        avatar_style: 'normal',
      },
      voice: {
        type: 'voice_id',
        voice_id: turn.speaker === 'Interviewer' ? INTERVIEWER_VOICE : CANDIDATE_VOICE,
      },
      line: { type: 'text', text: turn.text },
    })),
  };
}

async function generateVideo(payload) {
  console.log(`[heygen] POST ${HEYGEN_V3_VIDEOS} (${payload.scenes.length} scenes)`);
  const data = await request(
    HEYGEN_V3_VIDEOS,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Api-Key': HEYGEN_API_KEY },
      body: JSON.stringify(payload),
    },
    120000
  );
  const videoId = data?.data?.video_id || data?.video_id || data?.data?.id;
  if (!videoId) {
    throw new Error(`HeyGen returned no video_id: ${JSON.stringify(data).slice(0, 400)}`);
  }
  console.log(`[heygen] video_id: ${videoId}`);
  return videoId;
}

async function pollUntilCompleted(videoId) {
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  for (;;) {
    const data = await request(
      `${HEYGEN_V3_VIDEOS}/${encodeURIComponent(videoId)}`,
      { headers: { 'X-Api-Key': HEYGEN_API_KEY } },
      20000
    );
    const status = String(data?.data?.status || data?.status || '').toLowerCase();
    if (status === 'completed' || status === 'success') {
      const url = data?.data?.video_url || data?.data?.url || data?.video_url;
      if (!url) {
        throw new Error(
          `HeyGen completed but gave no video_url: ${JSON.stringify(data).slice(0, 300)}`
        );
      }
      return url;
    }
    if (status === 'failed' || status === 'error') {
      throw new Error(`HeyGen render failed: ${JSON.stringify(data?.data || data).slice(0, 400)}`);
    }
    if (Date.now() > deadline) {
      throw new Error(`Timed out waiting for HeyGen video ${videoId}`);
    }
    console.log(`[heygen] status="${status || 'pending'}" — waiting ${POLL_INTERVAL_MS / 1000}s`);
    await sleep(POLL_INTERVAL_MS);
  }
}

async function downloadVideo(videoUrl) {
  fs.mkdirSync(OUTPUTS_DIR, { recursive: true });
  const dest = path.join(OUTPUTS_DIR, FILENAME);
  console.log(`[download] ${videoUrl} → ${dest}`);
  const res = await fetch(videoUrl, { signal: AbortSignal.timeout(10 * 60 * 1000) });
  if (!res.ok) throw new Error(`Download failed (${res.status})`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(dest, buf);
  console.log(`[download] saved ${fs.statSync(dest).size} bytes`);
  return dest;
}

async function uploadToR2(localPath) {
  let S3Client;
  let PutObjectCommand;
  try {
    ({ S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3'));
  } catch {
    throw new Error('@aws-sdk/client-s3 is not installed. Run: npm install @aws-sdk/client-s3');
  }

  const s3 = new S3Client({
    region: 'auto',
    endpoint: R2_ENDPOINT,
    credentials: {
      accessKeyId: R2_ACCESS_KEY_ID,
      secretAccessKey: R2_SECRET_ACCESS_KEY,
    },
  });

  const body = fs.readFileSync(localPath);
  console.log(`[r2] uploading → s3://${R2_BUCKET}/${FILENAME} (endpoint ${R2_ENDPOINT})`);
  await s3.send(
    new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: FILENAME,
      Body: body,
      ContentType: 'video/mp4',
    })
  );
  console.log(`[r2] done → r2://${R2_BUCKET}/${FILENAME}`);
}

async function updateFirestore(r2Url) {
  let admin;
  try {
    admin = (await import('firebase-admin')).default;
  } catch {
    console.warn(
      '[firestore] firebase-admin not installed; skipping DB update. Run: npm install firebase-admin'
    );
    return false;
  }

  if (!admin.apps.length) {
    admin.initializeApp({ projectId: FIREBASE_PROJECT_ID });
  }
  const db = admin.firestore();
  await db.collection('videos').doc(VIDEO_ID).set(
    {
      video_id: VIDEO_ID,
      url: r2Url,
      url_mp4_en: r2Url,
      status: 'ready',
      playback_source: 'r2',
      source: 'heygen-v3',
      updated_at: new Date().toISOString(),
    },
    { merge: true }
  );
  console.log(`[firestore] upserted videos/${VIDEO_ID} with url ${r2Url}`);
  return true;
}

function validateEnv() {
  const missing = [];
  if (!HEYGEN_API_KEY) missing.push('HEYGEN_API_KEY');
  if (!INTERVIEWER_AVATAR) missing.push('HEYGEN_INTERVIEWER_AVATAR');
  if (!INTERVIEWER_VOICE) missing.push('HEYGEN_INTERVIEWER_VOICE');
  if (!CANDIDATE_AVATAR) missing.push('HEYGEN_CANDIDATE_AVATAR');
  if (!CANDIDATE_VOICE) missing.push('HEYGEN_CANDIDATE_VOICE');
  if (!R2_ACCOUNT_ID) missing.push('R2_ACCOUNT_ID');
  if (!R2_ACCESS_KEY_ID) missing.push('R2_ACCESS_KEY_ID');
  if (!R2_SECRET_ACCESS_KEY) missing.push('R2_SECRET_ACCESS_KEY');
  if (missing.length) {
    throw new Error(`Missing required env vars: ${missing.join(', ')}`);
  }
}

async function main() {
  validateEnv();

  const scriptPath = process.argv[2] ? path.resolve(process.argv[2]) : DEFAULT_SCRIPT;
  if (!fs.existsSync(scriptPath)) {
    throw new Error(`Dialogue file not found: ${scriptPath}`);
  }
  const text = fs.readFileSync(scriptPath, 'utf-8');
  const turns = parseDialogue(text);
  if (!turns.length) {
    throw new Error(`No dialogue turns found in ${scriptPath}`);
  }
  console.log(`[parse] ${turns.length} turns from ${scriptPath}`);
  console.log(
    `[parse] first speaker: ${turns[0].speaker} / last speaker: ${turns[turns.length - 1].speaker}`
  );

  const payload = buildPayload(turns);
  const videoId = await generateVideo(payload);
  const videoUrl = await pollUntilCompleted(videoId);
  const localMp4 = await downloadVideo(videoUrl);
  await uploadToR2(localMp4);

  const r2Url = `r2://${R2_BUCKET}/${FILENAME}`;
  try {
    await updateFirestore(r2Url);
  } catch (err) {
    console.warn(`[firestore] update failed (non-fatal): ${err.message}`);
  }

  console.log(`\n✓ Done. ${r2Url}`);
}

main().catch((err) => {
  console.error(`\n[ERROR] ${err.message}`);
  process.exitCode = 1;
});
