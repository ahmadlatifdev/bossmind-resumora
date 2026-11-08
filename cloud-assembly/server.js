/**
 * Resumora Cloud Video Assembly — serverless FFmpeg stitch service.
 *
 * POST /assemble
 *   { jobId, avatarUrl, brollUrls: string[], bucket?, outputPath? }
 *   -> downloads inputs, concats avatar intro + B-roll (1080p cover-crop),
 *      muxes the avatar's audio, uploads the final MP4 to GCS,
 *      returns { url, gsUrl, jobId }.
 *
 * GET /health -> 200 (Cloud Run liveness probe).
 */
import express from 'express';
import { Storage } from '@google-cloud/storage';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const execFileAsync = promisify(execFile);
const app = express();
app.use(express.json({ limit: '2mb' }));

const PORT = process.env.PORT || 8080;
const W = 1920;
const H = 1080;
const FPS = 30;

const storage = new Storage();

// --- helpers -------------------------------------------------------------

async function ffprobeDuration(file) {
  const { stdout } = await execFileAsync('ffprobe', [
    '-v',
    'error',
    '-show_entries',
    'format=duration',
    '-of',
    'default=noprint_wrappers=1:nokey=1',
    file,
  ]);
  return parseFloat(String(stdout).trim()) || 0;
}

async function download(url, dest) {
  const res = await fetch(url, { signal: AbortSignal.timeout(10 * 60 * 1000) });
  if (!res.ok) throw new Error(`download failed (${res.status}) for ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await fs.promises.writeFile(dest, buf);
  return dest;
}

/** Build the FFmpeg command that stitches avatar intro + B-roll over the audio. */
function buildFfmpegArgs(inputs, duration) {
  // inputs[0] = avatar (audio + intro), inputs[1..] = b-roll.
  const args = ['-y'];
  for (const f of inputs) args.push('-i', f);

  const n = inputs.length;
  const filters = [];
  const labels = [];
  for (let i = 0; i < n; i++) {
    const label = `v${i}`;
    labels.push(`[${label}]`);
    filters.push(
      `[${i}:v]scale=${W}:${H}:force_original_aspect_ratio=increase,` +
        `crop=${W}:${H},setsar=1,fps=${FPS},setpts=PTS-STARTPTS[${label}]`
    );
  }
  filters.push(
    `${labels.join('')}concat=n=${n}:v=1:a=0,` +
      `trim=duration=${duration.toFixed(3)},setpts=PTS-STARTPTS[vout]`
  );
  filters.push('[0:a]anull[aout]');

  args.push('-filter_complex', filters.join(';'));
  args.push('-map', '[vout]', '-map', '[aout]');
  args.push('-c:v', 'libx264', '-crf', '20', '-preset', 'medium');
  args.push('-c:a', 'aac', '-b:a', '192k');
  args.push('-pix_fmt', 'yuv420p', '-r', String(FPS));
  args.push('-movflags', '+faststart', '-shortest');
  return args;
}

// --- routes --------------------------------------------------------------

app.get('/health', (_req, res) => res.status(200).json({ ok: true }));

app.post('/assemble', async (req, res) => {
  const { jobId, avatarUrl, brollUrls = [], bucket, outputPath } = req.body || {};
  if (!avatarUrl || !Array.isArray(brollUrls) || brollUrls.length === 0) {
    return res.status(400).json({ error: 'avatarUrl and brollUrls[] are required' });
  }

  const tmp = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'asm-'));
  const inputs = [];
  try {
    const avatar = path.join(tmp, 'avatar.mp4');
    await download(avatarUrl, avatar);
    inputs.push(avatar);

    for (let i = 0; i < brollUrls.length; i++) {
      const clip = path.join(tmp, `broll-${i}.mp4`);
      await download(brollUrls[i], clip);
      inputs.push(clip);
    }

    const duration = await ffprobeDuration(avatar);
    const outFile = path.join(tmp, 'final.mp4');

    const args = buildFfmpegArgs(inputs, duration);
    args.push(outFile);
    await execFileAsync('ffmpeg', args, { maxBuffer: 32 * 1024 * 1024 });

    const destBucket = bucket || process.env.GCS_BUCKET || 'resumora-videos';
    const destPath = outputPath || `masters/cinematic/${jobId || Date.now()}.mp4`;
    await storage.bucket(destBucket).upload(outFile, {
      destination: destPath,
      metadata: { contentType: 'video/mp4', metadata: { jobId: String(jobId || '') } },
    });

    res.status(200).json({
      ok: true,
      jobId: jobId || null,
      gsUrl: `gs://${destBucket}/${destPath}`,
      url: `https://storage.googleapis.com/${destBucket}/${encodeURIComponent(destPath)}`,
      duration,
    });
  } catch (err) {
    console.error('[assemble] failed', err && err.message ? err.message : err);
    res.status(500).json({ error: err.message || 'assembly failed' });
  } finally {
    await fs.promises.rm(tmp, { recursive: true, force: true }).catch(() => {});
  }
});

app.listen(PORT, () => console.log(`cloud-assembly listening on :${PORT}`));
