/**
 * Manual Assembly Queue — when VEED Enterprise API is unavailable, export a ZIP
 * containing the script + asset manifest + upload instructions for one-click
 * manual assembly in the VEED UI.
 */
'use strict';

const archiver = require('archiver');
const { getFirestore } = require('firebase-admin/firestore');
const { getStorage } = require('firebase-admin/storage');

const BUCKET = process.env.MANUAL_ASSEMBLY_BUCKET || 'resumora-videos';

function buildReadme(job) {
  return [
    '# Resumora Manual Assembly',
    '',
    'VEED Enterprise API was not used — assemble this manually:',
    '',
    '1. Open VEED and create a new project (1080p, 16:9).',
    '2. Paste the narration from script.txt into the voiceover/audio track.',
    '3. Add the B-roll clips from manifest.json over the audio.',
    '4. Export as MP4 (1080p) and upload to R2:',
    `   bucket=${BUCKET}`,
    `   key=${job.outputPath || `masters/cinematic/${job.jobId}.mp4`}`,
    '',
    '5. Mark the job COMPLETED in the cinematic_jobs collection.',
  ].join('\n');
}

/**
 * Build + upload a manual-assembly ZIP for a cinematic job.
 * Returns { jobId, gsUrl, url }.
 */
async function exportManualAssemblyZip(db, jobId) {
  const snap = await db.collection('cinematic_jobs').doc(String(jobId)).get();
  if (!snap.exists) throw new Error(`Cinematic job ${jobId} not found`);
  const job = snap.data() || {};
  const script = String(job.scriptText || job.script || '');
  if (!script) throw new Error(`Job ${jobId} has no scriptText`);

  const manifest = {
    jobId: String(jobId),
    scriptCharacters: script.length,
    avatarUrl: job.heygenVideoUrl || null,
    brollUrls: Array.isArray(job.brollUrls) ? job.brollUrls : [],
    outputBucket: BUCKET,
    outputPath: job.outputPath || `masters/cinematic/${jobId}.mp4`,
  };

  const archive = archiver('zip', { zlib: { level: 9 } });
  const chunks = [];
  archive.on('data', (c) => chunks.push(c));
  const finished = new Promise((resolve, reject) => {
    archive.on('end', resolve);
    archive.on('error', reject);
  });

  archive.append(script, { name: 'script.txt' });
  archive.append(JSON.stringify(manifest, null, 2), { name: 'manifest.json' });
  archive.append(buildReadme(manifest), { name: 'README.md' });
  await archive.finalize();
  await finished;

  const buf = Buffer.concat(chunks);
  const dest = `masters/cinematic/${jobId}/manual-assembly.zip`;
  const file = getStorage().bucket(BUCKET).file(dest);
  await file.save(buf, { contentType: 'application/zip', resumable: false });

  const [url] = await file.getSignedUrl({
    version: 'v4',
    action: 'read',
    expires: Date.now() + 24 * 60 * 60 * 1000,
  });

  await db
    .collection('cinematic_jobs')
    .doc(String(jobId))
    .set(
      { manualAssemblyZip: `gs://${BUCKET}/${dest}`, state: 'MANUAL_ASSEMBLY_READY' },
      { merge: true }
    );

  return { jobId: String(jobId), gsUrl: `gs://${BUCKET}/${dest}`, url };
}

module.exports = { exportManualAssemblyZip };
