/**
 * Bulk-seed gs://resumora-videos/active/* into Firestore video_registry (status: Current).
 * Uses gcloud user credentials (print-access-token) — works when ADC has invalid_rapt.
 * Skips URLs that already have a registry doc. Optional --cleanup-e2e.
 *
 *   node scripts/seed-videos.cjs
 *   node scripts/seed-videos.cjs --cleanup-e2e
 */
'use strict';

const { execFileSync, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const BUCKET = process.env.VIDEO_ARCHIVE_BUCKET || 'resumora-videos';
const COLLECTION = process.env.VIDEO_REGISTRY_COLLECTION || 'video_registry';
const PROJECT =
  process.env.GCLOUD_PROJECT ||
  process.env.GOOGLE_CLOUD_PROJECT ||
  process.env.GCP_PROJECT_ID ||
  'resumora-live';
const cleanupE2e = process.argv.includes('--cleanup-e2e');
const VIDEO_RE = /\.(mp4|mov|avi|mkv|webm)$/i;

function resolveGcloud() {
  const candidates = [
    process.env.GCLOUD_CMD,
    'C:\\Users\\user\\AppData\\Local\\Google\\Cloud SDK\\google-cloud-sdk\\bin\\gcloud.cmd',
    'gcloud.cmd',
    'gcloud',
  ].filter(Boolean);
  for (const c of candidates) {
    try {
      if (c.includes('\\') || c.includes('/')) {
        if (fs.existsSync(c)) return c;
      } else {
        return c;
      }
    } catch {
      /* try next */
    }
  }
  return 'gcloud';
}

const GCLOUD = resolveGcloud();

function gcloudOut(args) {
  // Quote paths with spaces; use shell so Windows .cmd works.
  const quotedArgs = args
    .map((a) => (/\s/.test(a) ? `"${String(a).replace(/"/g, '\\"')}"` : String(a)))
    .join(' ');
  return execSync(`"${GCLOUD}" ${quotedArgs}`, {
    encoding: 'utf8',
    windowsHide: true,
    shell: true,
    maxBuffer: 10 * 1024 * 1024,
  }).trim();
}

function accessToken() {
  return gcloudOut(['auth', 'print-access-token']);
}

function listActiveVideos() {
  const out = gcloudOut(['storage', 'ls', `gs://${BUCKET}/active/`]);
  return out
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => VIDEO_RE.test(l));
}

function sanitizeDocId(fileName) {
  const base = path.basename(fileName, path.extname(fileName)).replace(/[^a-zA-Z0-9]+/g, '_');
  const day = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  return `video_${day}_${base}`.slice(0, 80);
}

async function firestoreFetch(pathname, { method = 'GET', body } = {}) {
  const token = accessToken();
  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents${pathname}`;
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  if (!res.ok) {
    const msg = (json && (json.error && json.error.message)) || text || res.statusText;
    const err = new Error(`Firestore ${method} ${pathname}: ${msg}`);
    err.status = res.status;
    throw err;
  }
  return json;
}

async function listAllDocs() {
  const urls = new Set();
  const docs = [];
  let pageToken = '';
  do {
    const q = pageToken
      ? `/${COLLECTION}?pageSize=300&pageToken=${encodeURIComponent(pageToken)}`
      : `/${COLLECTION}?pageSize=300`;
    const page = await firestoreFetch(q);
    for (const doc of page.documents || []) {
      docs.push(doc);
      const active = doc.fields && doc.fields.active_url && doc.fields.active_url.stringValue;
      if (active) urls.add(active);
    }
    pageToken = page.nextPageToken || '';
  } while (pageToken);
  return { urls, docs };
}

async function createDoc(docId, fields) {
  return firestoreFetch(`/${COLLECTION}?documentId=${encodeURIComponent(docId)}`, {
    method: 'POST',
    body: { fields },
  });
}

async function deleteDoc(name) {
  // name is full resource name or collection/docId
  const pathname = name.startsWith('projects/')
    ? `/${name.split('/documents/')[1]}`
    : `/${name}`;
  return firestoreFetch(pathname, { method: 'DELETE' });
}

async function main() {
  console.log('============================================================');
  console.log('BULK SEED: Real Videos → video_registry');
  console.log(`project=${PROJECT} bucket=${BUCKET} collection=${COLLECTION}`);
  console.log(`gcloud=${GCLOUD}`);
  console.log('============================================================');

  console.log('Step 1: Listing active/ …');
  const videoFiles = listActiveVideos();
  console.log(`   Found ${videoFiles.length} video(s)`);
  if (!videoFiles.length) {
    console.log('Nothing to seed.');
    return;
  }

  console.log('Step 2: Loading existing video_registry …');
  const { urls: existingUrls, docs } = await listAllDocs();
  console.log(`   Existing docs: ${docs.length} (with active_url: ${existingUrls.size})`);

  let created = 0;
  let skipped = 0;
  const nowIso = new Date().toISOString();

  for (const gcsPath of videoFiles) {
    const fileName = path.basename(gcsPath);
    if (existingUrls.has(gcsPath)) {
      console.log(`   skip ${fileName} (already registered)`);
      skipped += 1;
      continue;
    }
    let docId = sanitizeDocId(fileName);
    // Avoid ID collision
    const idTaken = docs.some((d) => d.name && d.name.endsWith(`/${docId}`));
    if (idTaken) docId = `${docId}_${Date.now().toString(36)}`;

    await createDoc(docId, {
      status: { stringValue: 'Current' },
      active_url: { stringValue: gcsPath },
      title: { stringValue: fileName },
      video_id: { stringValue: docId },
      created_at: { timestampValue: nowIso },
      file_size_bytes: { integerValue: '0' },
      duration_seconds: { integerValue: '0' },
      source: { stringValue: 'bulk_seed_gcs_active' },
    });
    existingUrls.add(gcsPath);
    created += 1;
    console.log(`   created ${docId} ← ${fileName}`);
  }

  if (cleanupE2e) {
    console.log('Step 3: Cleaning E2E canaries…');
    const e2ePrefix = `gs://${BUCKET}/active/bossmind-e2e-`;
    for (const doc of docs) {
      const id = doc.name ? doc.name.split('/').pop() : '';
      const url =
        (doc.fields && doc.fields.active_url && doc.fields.active_url.stringValue) || '';
      const title = (doc.fields && doc.fields.title && doc.fields.title.stringValue) || '';
      if (url.startsWith(e2ePrefix) || /^bossmind-e2e-/i.test(title) || /^test_/i.test(id)) {
        await deleteDoc(doc.name);
        console.log(`   deleted Firestore ${id}`);
      }
    }
    // Also delete freshly created e2e if any (re-list not needed for seed pass)
    try {
      gcloudOut(['storage', 'rm', `gs://${BUCKET}/active/bossmind-e2e-*`]);
      console.log('   deleted GCS bossmind-e2e-*');
    } catch (err) {
      console.warn('   GCS e2e delete note:', err.message || err);
    }
  } else {
    console.log('Step 3: Keeping E2E canaries (pass --cleanup-e2e to remove).');
  }

  console.log('============================================================');
  console.log(`DONE created=${created} skipped=${skipped} scanned=${videoFiles.length}`);
  console.log('Next: Admin Videos → Current registry; cron archives on schedule.');
  console.log('============================================================');
}

main().catch((err) => {
  console.error('SEED FAILED:', err.message || err);
  process.exit(1);
});

