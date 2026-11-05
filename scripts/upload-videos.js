#!/usr/bin/env node
/**
 * Automated GCS uploader for premium assets (Firebase Admin / @google-cloud/storage).
 *
 * Uploads:
 *   - Videos:  <videos-dir>/*.mp4          → gs://<bucket>/masters/interview-series-v1/<file>.mp4
 *   - PDFs:    <pdfs-dir>/*.pdf            → gs://<bucket>/luxury-pdfs/<file>.pdf
 *
 * Objects are uploaded private (GCS default — no allUsers/public access), so only
 * the auth-gated signed-URL endpoints can serve them.
 *
 * Auth: uses Application Default Credentials (GOOGLE_APPLICATION_CREDENTIALS or
 * gcloud auth application-default login), or pass --key-file <path>.
 *
 * Usage:
 *   node scripts/upload-videos.js
 *   node scripts/upload-videos.js --dry-run
 *   node scripts/upload-videos.js --bucket my-bucket --videos-dir ./public/videos --pdfs-dir ./luxury-pdfs
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

  const storage = args.keyFile ? new Storage({ keyFilename: args.keyFile }) : new Storage();
  const bucket = storage.bucket(args.bucket);

  let uploaded = 0;
  let skipped = 0;
  let planned = 0;

  async function uploadOne(localPath, destPath, contentType) {
    if (args.dryRun) {
      console.log(`• [dry-run] would upload: ${destPath}`);
      planned += 1;
      return;
    }
    const file = bucket.file(destPath);
    const [exists] = await file.exists();
    if (exists) {
      console.log(`• skip (exists): ${destPath}`);
      skipped += 1;
      return;
    }
    await bucket.upload(localPath, {
      destination: destPath,
      contentType,
      metadata: { metadata: { source: 'upload-script', uploaded_by: 'scripts/upload-videos.js' } },
      resumable: false,
    });
    console.log(`✓ uploaded: ${destPath}`);
    uploaded += 1;
  }

  const videos = listFiles(videosDir, '.mp4');
  console.log(`Found ${videos.length} video(s) in ${videosDir}.`);
  for (const f of videos) {
    await uploadOne(path.join(videosDir, f), `${VIDEOS_PREFIX}/${f}`, 'video/mp4');
  }

  const pdfs = listFiles(pdfsDir, '.pdf');
  console.log(`\nFound ${pdfs.length} PDF(s) in ${pdfsDir}.`);
  for (const f of pdfs) {
    await uploadOne(path.join(pdfsDir, f), `${PDFS_PREFIX}/${f}`, 'application/pdf');
  }

  console.log('\nDone.');
  if (args.dryRun) {
    console.log(`Dry run: ${planned} file(s) would be uploaded.`);
  } else {
    console.log(`Uploaded ${uploaded}, skipped ${skipped} (already present).`);
    console.log('Objects are private (no public access) — served only via signed URLs.');
  }
}

main().catch((err) => {
  console.error('Upload failed:', err && err.message ? err.message : err);
  process.exit(1);
});
