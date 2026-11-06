#!/usr/bin/env node
/**
 * 100% automated HeyGen conversational-avatar video generation + Firebase upload.
 *
 * For each role it:
 *   1. Uploads pipeline/assets/audio/<role>_combined.mp3 to Firebase Storage and
 *      mints a temporary signed URL (HeyGen needs a public URL).
 *   2. POSTs to HeyGen /v2/video/generate (avatar + audio, 1080p).
 *   3. Polls /v1/video_status.get every 15s until "completed".
 *   4. Downloads the MP4 to pipeline/outputs/<role>.mp4.
 *   5. Uploads the MP4 to gs://<bucket>/masters/interview-series-v1/<role>.mp4.
 *   6. Deletes the temporary audio object.
 *
 * Required env (see pipeline/.env.example):
 *   HEYGEN_API_KEY                 — HeyGen API key
 *   HEYGEN_AVATAR_ID               — HeyGen avatar id (a talking-photo/avatar you created)
 *   GOOGLE_APPLICATION_CREDENTIALS — path to your Firebase/Google service-account JSON
 *   STORAGE_BUCKET                 — (optional, default "resumora-videos")
 *
 * Usage: node pipeline/scripts/heygen_pipeline.js [role ...]
 */

import { loadEnvFile } from 'node:process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Storage } from '@google-cloud/storage';

try {
  loadEnvFile(); // loads .env from the current working directory
} catch {
  /* no .env — rely on exported env vars */
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PIPELINE_DIR = path.resolve(__dirname, '..');
const AUDIO_DIR = path.join(PIPELINE_DIR, 'assets', 'audio');
const OUTPUTS_DIR = path.join(PIPELINE_DIR, 'outputs');

const HEYGEN_BASE = 'https://api.heygen.com';
const HEYGEN_API_KEY = process.env.HEYGEN_API_KEY || '';
const AVATAR_ID = process.env.HEYGEN_AVATAR_ID || '';
const BUCKET = process.env.STORAGE_BUCKET || 'resumora-videos';

const ROLES = ['software_engineer', 'data_scientist', 'product_manager', 'marketing_manager'];
const POLL_INTERVAL_MS = 15000;
const POLL_TIMEOUT_MS = 60 * 60 * 1000; // 1 hour max

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
      data = { raw: text.slice(0, 200) };
    }
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

async function uploadAudio(role) {
  const audioPath = path.join(AUDIO_DIR, `${role}_combined.mp3`);
  if (!fs.existsSync(audioPath)) {
    throw new Error(`Missing audio ${audioPath}`);
  }
  const destination = `heygen-audio/${role}_combined.mp3`;
  const storage = new Storage();
  const bucket = storage.bucket(BUCKET);

  console.log(`  [upload] ${audioPath} → gs://${BUCKET}/${destination}`);
  await bucket.upload(audioPath, {
    destination,
    contentType: 'audio/mpeg',
    resumable: false,
  });

  const [signedUrl] = await bucket.file(destination).getSignedUrl({
    action: 'read',
    version: 'v4',
    expires: Date.now() + 2 * 60 * 60 * 1000, // 2 hours — long enough for the render
  });
  console.log(`  [signed] audio URL ready (2h expiry)`);
  return { bucket, destination, signedUrl };
}

async function generateVideo(signedUrl) {
  console.log(`  [heygen] generating avatar video (1080p, avatar ${AVATAR_ID})…`);
  const body = {
    video_inputs: [
      {
        character: { type: 'avatar', avatar_id: AVATAR_ID, avatar_style: 'normal' },
        voice: { type: 'audio', audio_url: signedUrl },
      },
    ],
    dimension: { width: 1920, height: 1080 },
  };
  const data = await request(
    `${HEYGEN_BASE}/v2/video/generate`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Api-Key': HEYGEN_API_KEY },
      body: JSON.stringify(body),
    },
    90000
  );

  const videoId = data?.data?.video_id;
  if (!videoId) {
    throw new Error(`HeyGen did not return a video_id: ${JSON.stringify(data).slice(0, 400)}`);
  }
  console.log(`  [heygen] video_id: ${videoId}`);
  return videoId;
}

async function pollUntilCompleted(videoId) {
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  for (;;) {
    const data = await request(
      `${HEYGEN_BASE}/v1/video_status.get?video_id=${encodeURIComponent(videoId)}`,
      { headers: { 'X-Api-Key': HEYGEN_API_KEY } },
      20000
    );
    const status = String(data?.data?.status || '').toLowerCase();
    if (status === 'completed') {
      const url = data?.data?.video_url || data?.data?.url;
      if (!url)
        throw new Error(
          `HeyGen completed but gave no video_url: ${JSON.stringify(data).slice(0, 300)}`
        );
      return url;
    }
    if (status === 'failed') {
      throw new Error(`HeyGen render failed: ${JSON.stringify(data?.data).slice(0, 400)}`);
    }
    if (Date.now() > deadline) {
      throw new Error(`Timed out waiting for video ${videoId}`);
    }
    console.log(`  [heygen] status="${status || 'pending'}" — waiting ${POLL_INTERVAL_MS / 1000}s`);
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
}

async function downloadVideo(videoUrl, role) {
  fs.mkdirSync(OUTPUTS_DIR, { recursive: true });
  const dest = path.join(OUTPUTS_DIR, `${role}.mp4`);
  console.log(`  [download] ${videoUrl} → ${dest}`);
  const res = await fetch(videoUrl, { signal: AbortSignal.timeout(10 * 60 * 1000) });
  if (!res.ok) throw new Error(`Download failed (${res.status})`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(dest, buf);
  console.log(`  [download] saved ${fs.statSync(dest).size} bytes`);
  return dest;
}

async function uploadFinal(bucket, localMp4, role) {
  const destination = `masters/interview-series-v1/${role}.mp4`;
  console.log(`  [firebase] uploading ${localMp4} → gs://${BUCKET}/${destination}`);
  await bucket.upload(localMp4, {
    destination,
    contentType: 'video/mp4',
    resumable: true,
  });
  console.log(`  [firebase] done: ${destination}`);
}

async function cleanupAudio(bucket, destination) {
  try {
    await bucket.file(destination).delete();
    console.log(`  [cleanup] deleted ${destination}`);
  } catch {
    console.warn(`  [cleanup] could not delete ${destination} (ignored)`);
  }
}

async function runRole(role) {
  console.log(`\n[${role}]`);
  const { bucket, destination, signedUrl } = await uploadAudio(role);
  const videoId = await generateVideo(signedUrl);
  const videoUrl = await pollUntilCompleted(videoId);
  const localMp4 = await downloadVideo(videoUrl, role);
  await uploadFinal(bucket, localMp4, role);
  await cleanupAudio(bucket, destination);
  console.log(`[${role}] ✓ complete`);
}

async function main() {
  if (!HEYGEN_API_KEY) {
    console.error('[ERROR] HEYGEN_API_KEY is not set.');
    console.error('  echo "HEYGEN_API_KEY=your_key_here" >> .env');
    process.exit(1);
  }
  if (!AVATAR_ID) {
    console.error(
      '[ERROR] HEYGEN_AVATAR_ID is not set (create an avatar at heygen.com and set its id).'
    );
    process.exit(1);
  }

  const requested = process.argv.slice(2);
  const roles = requested.length ? requested : ROLES;

  let ok = 0;
  for (const role of roles) {
    try {
      await runRole(role);
      ok += 1;
    } catch (err) {
      console.error(`[ERROR] ${role}: ${err.message}`);
    }
  }
  console.log(`\nDone. ${ok}/${roles.length} videos generated + uploaded.`);
  if (ok < roles.length) process.exitCode = 1;
}

main();
