#!/usr/bin/env node
/**
 * Automated GCS uploader for premium assets (via Firebase Admin / @google-cloud/storage).
 *
 * ── AUTHENTICATION ────────────────────────────────────────────────────────────
 * This script needs Google Cloud credentials. Set ONE of:
 *
 *   PowerShell:  $env:GOOGLE_APPLICATION_CREDENTIALS = "C:\path\to\service-account.json"
 *   (Download a service-account JSON key from Google Cloud → IAM & Admin →
 *    Service Accounts → select the account → Keys → Add Key → JSON.)
 *
 *   …or pass it directly:   node scripts/upload-videos.js --key-file "C:\path\to\service-account.json"
 *   …or run `gcloud auth application-default login` to use ADC.
 *
 * ── WHAT IT UPLOADS ───────────────────────────────────────────────────────────
 *   public/videos/*.mp4  →  gs://<bucket>/masters/interview-series-v1/<file>.mp4
 *   luxury-pdfs/*.pdf    →  gs://<bucket>/luxury-pdfs/<file>.pdf
 *
 * GCS has no real "folders" — the `masters/interview-series-v1/` prefix appears in
 * the console as soon as the first object is uploaded. Objects are private by
 * default (no public access), so only the auth-gated signed-URL endpoints can
 * serve them.
 *
 * Usage:
 *   node scripts/upload-videos.js
 *   node scripts/upload-videos.js --dry-run
 *   node scripts/upload-videos.js --bucket my-bucket --key-file ./key.json
 */
import fs from 'node:fs';
import path from 'node:path';
import { Storage } from '@google-cloud/storage';

const DEFAULT_BUCKET =
  process.env.STORAGE_BUCKET || process.env.VIDEO_ARCHIVE_BUCKET || 'resumora-videos';
const VIDEOS_PREFIX = 'masters/interview-series-v1';
const PDFS_PREFIX = 'luxury-pdfs';

function parseArgs(argv) {
  const args = {
    bucket: DEFAULT_BUCKET,
    videosDir: null,
    pdfsDir: null,
    keyFile: null,
    dryRun: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--bucket' && argv[i + 1]) args.bucket = argv[++i];
    else if (a === '--videos-dir' && argv[i + 1]) args.videosDir = argv[++i];
    else if (a === '--pdfs-dir' && argv[i + 1]) args.pdfsDir = argv[++i];
    else if (a === '--key-file' && argv[i + 1]) args.keyFile = argv[++i];
    else if (a === '--dry-run') args.dryRun = true;
  }
  return args;
}

function listFiles(dir, ext) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.toLowerCase().endsWith(ext))
    .sort();
}

function isAuthError(err) {
  const msg = String((err && err.message) || err || '').toLowerCase();
  return (
    msg.includes('could not load the default credentials') ||
    msg.includes('could not find default credentials') ||
    msg.includes('requires authentication') ||
    msg.includes('unauthorized') ||
    msg.includes('forbidden') ||
    msg.includes('invalid_grant')
  );
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const videosDir = args.videosDir
    ? path.resolve(args.videosDir)
    : path.resolve(process.cwd(), 'public', 'videos');
  const pdfsDir = args.pdfsDir
    ? path.resolve(args.pdfsDir)
    : path.resolve(process.cwd(), 'luxury-pdfs');

  console.log(`Bucket:      gs://${args.bucket}`);
  console.log(`Videos dir:  ${videosDir}`);
  console.log(`PDFs dir:    ${pdfsDir}`);
  console.log(`Mode:        ${args.dryRun ? 'DRY-RUN (no upload)' : 'UPLOAD'}\n`);

  const hasKey = Boolean(args.keyFile || process.env.GOOGLE_APPLICATION_CREDENTIALS);
  if (!args.dryRun && !hasKey) {
    console.warn(
      '⚠  No credentials detected. Set GOOGLE_APPLICATION_CREDENTIALS, pass --key-file, or run `gcloud auth application-default login`.\n'
    );
  }

  const storage = args.keyFile ? new Storage({ keyFilename: args.keyFile }) : new Storage();
  const bucket = storage.bucket(args.bucket);

  let uploaded = 0;
  let skipped = 0;
  let failed = 0;
  let planned = 0;

  async function uploadOne(localPath, destPath, contentType, label) {
    if (args.dryRun) {
      console.log(`• [dry-run] would upload: ${destPath}`);
      planned += 1;
      return;
    }
    try {
      const file = bucket.file(destPath);
      const [exists] = await file.exists();
      if (exists) {
        console.log(`• skipped (already exists): ${destPath}`);
        skipped += 1;
        return;
      }
      await bucket.upload(localPath, {
        destination: destPath,
        contentType,
        metadata: { metadata: { source: 'upload-script' } },
        resumable: false,
      });
      console.log(`✓ Uploaded ${label} successfully → ${destPath}`);
      uploaded += 1;
    } catch (err) {
      failed += 1;
      if (isAuthError(err)) {
        console.error(
          `✗ Auth error for ${label}. Set GOOGLE_APPLICATION_CREDENTIALS to your service-account JSON, or pass --key-file.\n` +
            `  Details: ${err && err.message ? err.message : err}`
        );
      } else {
        console.error(`✗ Failed to upload ${label}: ${err && err.message ? err.message : err}`);
      }
    }
  }

  const videos = listFiles(videosDir, '.mp4');
  console.log(`Found ${videos.length} video(s) in ${videosDir}.`);
  for (const f of videos) {
    await uploadOne(path.join(videosDir, f), `${VIDEOS_PREFIX}/${f}`, 'video/mp4', f);
  }

  const pdfs = listFiles(pdfsDir, '.pdf');
  console.log(`\nFound ${pdfs.length} PDF(s) in ${pdfsDir}.`);
  for (const f of pdfs) {
    await uploadOne(path.join(pdfsDir, f), `${PDFS_PREFIX}/${f}`, 'application/pdf', f);
  }

  console.log('\nDone.');
  if (args.dryRun) {
    console.log(`Dry run: ${planned} file(s) would be uploaded.`);
  } else {
    console.log(`Uploaded ${uploaded}, skipped ${skipped}, failed ${failed}.`);
    if (failed > 0) process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error('Upload failed:', err && err.message ? err.message : err);
  process.exit(1);
});
