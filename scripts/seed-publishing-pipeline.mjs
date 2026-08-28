/**
 * Seed masters → GCS + Firestore videos + publishing_queue (pending).
 *
 * Usage:
 *   node scripts/seed-publishing-pipeline.mjs
 *   node scripts/seed-publishing-pipeline.mjs --skip-upload
 *   node scripts/seed-publishing-pipeline.mjs --prepare   # also run ffmpeg prep if available
 *
 * Never prints secret values.
 */

import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const MASTERS_DIR = path.join(REPO_ROOT, 'public', 'videos');
const PROJECT = process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT || 'resumora-live';
const BUCKET = process.env.GCS_BUCKET_NAME || process.env.VEO_OUTPUT_BUCKET || 'resumora-videos';
const HOSTING_BASE = String(process.env.RESUMORA_BASE_URL || 'https://resumora.net').replace(/\/$/, '');

const VIDEO_IDS = [
  'vid-resume-writing',
  'vid-ats-optimization',
  'vid-linkedin-tips',
  'vid-interview-prep',
];

const PLATFORMS = ['youtube', 'tiktok', 'instagram', 'facebook', 'linkedin', 'x', 'bilibili'];

function loadI18n() {
  const out = {};
  for (const lang of ['en', 'fr', 'es']) {
    const p = path.join(REPO_ROOT, 'locales', `${lang}.json`);
    out[lang] = JSON.parse(fs.readFileSync(p, 'utf8'));
  }
  return out;
}

function t(bundle, lang, key, fallback = '') {
  const table = bundle[lang] || bundle.en || {};
  return table[key] || bundle.en?.[key] || fallback || key;
}

function gcloud(args) {
  const bin = process.platform === 'win32' ? 'gcloud.cmd' : 'gcloud';
  const r = spawnSync(bin, args, { encoding: 'utf8', shell: true });
  if (r.status !== 0) {
    throw new Error((r.stderr || r.stdout || `gcloud exit ${r.status}`).slice(0, 300));
  }
  return String(r.stdout || '').trim();
}

function findLocalMaster(id) {
  const candidates = [
    path.join(MASTERS_DIR, `${id}.mp4`),
    path.join(MASTERS_DIR, `${id}-en.mp4`),
    path.join(MASTERS_DIR, `${id}.en.mp4`),
  ];
  return candidates.find((p) => fs.existsSync(p)) || null;
}

function firestoreValue(val) {
  if (val === null || val === undefined) return { nullValue: null };
  if (typeof val === 'boolean') return { booleanValue: val };
  if (typeof val === 'number' && Number.isInteger(val)) return { integerValue: String(val) };
  if (typeof val === 'number') return { doubleValue: val };
  if (Array.isArray(val)) {
    return { arrayValue: { values: val.map((v) => firestoreValue(v)) } };
  }
  if (typeof val === 'object') {
    const fields = {};
    for (const [k, v] of Object.entries(val)) fields[k] = firestoreValue(v);
    return { mapValue: { fields } };
  }
  return { stringValue: String(val) };
}

async function upsertDoc(collection, id, data) {
  const token = gcloud(['auth', 'print-access-token', `--project=${PROJECT}`]);
  const uri = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/${collection}/${encodeURIComponent(id)}`;
  const fields = {};
  for (const [k, v] of Object.entries(data)) fields[k] = firestoreValue(v);
  const res = await fetch(uri, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ fields }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Firestore ${collection}/${id} HTTP ${res.status}: ${body.slice(0, 220)}`);
  }
}

async function createQueueDoc(data) {
  const token = gcloud(['auth', 'print-access-token', `--project=${PROJECT}`]);
  const uri = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/publishing_queue`;
  const fields = {};
  for (const [k, v] of Object.entries(data)) fields[k] = firestoreValue(v);
  const res = await fetch(uri, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ fields }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`publishing_queue create HTTP ${res.status}: ${body.slice(0, 220)}`);
  }
  const json = await res.json();
  return json.name || null;
}

function buildMetadata(i18n, videoId, locale = 'en') {
  const title = t(i18n, locale, `publish.${videoId}.title`, videoId.replace(/^vid-/, '').replace(/-/g, ' '));
  const description = t(
    i18n,
    locale,
    `publish.${videoId}.description`,
    `${title} — https://resumora.net`
  );
  const tagsRaw = t(i18n, locale, `publish.${videoId}.tags`, 'Resumora,resume,career');
  const tags = String(tagsRaw)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return { title, description, tags, locale };
}

async function main() {
  const skipUpload = process.argv.includes('--skip-upload');
  const doPrepare = process.argv.includes('--prepare');
  const i18n = loadI18n();

  console.log(JSON.stringify({ scope: 'seedPublishingPipeline', project: PROJECT, bucket: BUCKET }));

  const missing = [];
  for (const videoId of VIDEO_IDS) {
    const local = findLocalMaster(videoId);
    if (!local) {
      missing.push(videoId);
      console.warn(JSON.stringify({ scope: 'seedPublishingPipeline', step: 'missing_local', videoId }));
      continue;
    }

    const masterObject = `masters/${videoId}-en.mp4`;
    if (!skipUpload) {
      console.log(JSON.stringify({ scope: 'seedPublishingPipeline', step: 'upload_master', videoId }));
      gcloud(['storage', 'cp', local, `gs://${BUCKET}/${masterObject}`, `--project=${PROJECT}`]);
    }

    if (doPrepare) {
      const prep = spawnSync(
        process.execPath,
        [
          path.join(REPO_ROOT, 'scripts', 'prepare-platform-videos.mjs'),
          '--input',
          local,
          '--id',
          videoId,
          '--langs',
          'en,fr,es',
        ],
        { encoding: 'utf8' }
      );
      if (prep.status === 0) {
        const outDir = path.join(REPO_ROOT, 'dist-media', videoId);
        const landscape = path.join(outDir, `${videoId}.landscape-16x9.mp4`);
        const vertical = path.join(outDir, `${videoId}.shorts-9x16.mp4`);
        if (fs.existsSync(landscape)) {
          gcloud([
            'storage',
            'cp',
            landscape,
            `gs://${BUCKET}/distribute-outbox/${videoId}/${path.basename(landscape)}`,
            `--project=${PROJECT}`,
          ]);
        }
        if (fs.existsSync(vertical)) {
          gcloud([
            'storage',
            'cp',
            vertical,
            `gs://${BUCKET}/distribute-outbox/${videoId}/${path.basename(vertical)}`,
            `--project=${PROJECT}`,
          ]);
        }
      } else {
        console.warn(
          JSON.stringify({
            scope: 'seedPublishingPipeline',
            step: 'prepare_skipped',
            videoId,
            hint: 'Install ffmpeg or omit --prepare',
          })
        );
      }
    }

    const metaEn = buildMetadata(i18n, videoId, 'en');
    const metaFr = buildMetadata(i18n, videoId, 'fr');
    const metaEs = buildMetadata(i18n, videoId, 'es');
    const urlEn = `https://storage.googleapis.com/${BUCKET}/${masterObject}`;

    await upsertDoc('videos', videoId, {
      id: videoId,
      title_en: metaEn.title,
      title_fr: metaFr.title,
      title_es: metaEs.title,
      description_en: metaEn.description,
      description_fr: metaFr.description,
      description_es: metaEs.description,
      tags_en: metaEn.tags.join(','),
      url_mp4_en: urlEn,
      captions_en: `${HOSTING_BASE}/subtitles/${videoId}.en.vtt`,
      captions_fr: `${HOSTING_BASE}/subtitles/${videoId}.fr.vtt`,
      captions_es: `${HOSTING_BASE}/subtitles/${videoId}.es.vtt`,
      brandUrl: 'https://resumora.net',
      gcsMaster: masterObject,
      updatedAt: new Date().toISOString(),
    });

    const queueName = await createQueueDoc({
      videoId,
      status: 'pending',
      platforms: PLATFORMS,
      locale: 'en',
      title: metaEn.title,
      description: `${metaEn.description}\n\nhttps://resumora.net`,
      tags: metaEn.tags,
      gcsMaster: masterObject,
      gcsLandscape: `distribute-outbox/${videoId}/${videoId}.landscape-16x9.mp4`,
      gcsVertical: `distribute-outbox/${videoId}/${videoId}.shorts-9x16.mp4`,
      brandUrl: 'https://resumora.net',
      bilibiliAiVoiceNote:
        'After publish, enable Bilibili AI translation / AI Voice in Creator for ZH audiences.',
      createdAt: new Date().toISOString(),
    });

    console.log(
      JSON.stringify({
        scope: 'seedPublishingPipeline',
        step: 'queued',
        videoId,
        queueDoc: queueName,
      })
    );
  }

  if (missing.length) {
    console.warn(
      JSON.stringify({
        scope: 'seedPublishingPipeline',
        step: 'incomplete',
        missing,
        hint: 'Place MP4s under public/videos/ then re-run',
      })
    );
    process.exitCode = 2;
  } else {
    console.log(JSON.stringify({ scope: 'seedPublishingPipeline', step: 'done', count: VIDEO_IDS.length }));
  }
}

main().catch((err) => {
  console.error(JSON.stringify({ scope: 'seedPublishingPipeline', error: String(err.message || err).slice(0, 300) }));
  process.exit(1);
});
