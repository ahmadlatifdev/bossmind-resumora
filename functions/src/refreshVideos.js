/**
 * Quarterly video archival cron handler.
 * Pub/Sub topic: refresh-videos-topic (Cloud Scheduler refresh-videos-cron).
 * Uses Firestore batch updates + GCS copy into archive/{YYYY-Qn}/.
 */
'use strict';

const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { getStorage } = require('firebase-admin/storage');
const { AIGateway } = require('./services/AIGateway');

const BUCKET = process.env.VIDEO_ARCHIVE_BUCKET || 'resumora-videos';
const COLLECTION = process.env.VIDEO_REGISTRY_COLLECTION || 'video_registry';

function parseObjectPath(urlOrPath) {
  const raw = String(urlOrPath || '').trim();
  if (!raw) return '';
  return raw
    .replace(/^gs:\/\/[^/]+\//i, '')
    .replace(/^https?:\/\/storage\.googleapis\.com\/[^/]+\//i, '')
    .replace(/^https?:\/\/storage\.cloud\.google\.com\/[^/]+\//i, '')
    .split('?')[0];
}

function quarterLabel(date = new Date()) {
  const q = Math.floor(date.getMonth() / 3) + 1;
  return `${date.getFullYear()}-Q${q}`;
}

/**
 * HTTP or Pub/Sub entry. Returns { archived, quarter, prefix } or sends HTTP response.
 */
async function refreshVideos(req, res) {
  const isHttp = Boolean(res && typeof res.status === 'function');
  try {
    const now = new Date();
    const label = quarterLabel(now);
    const archivePrefix = `archive/${label}/`;
    const db = getFirestore();
    const bucket = getStorage().bucket(BUCKET);
    const aiGateway = new AIGateway();

    const snapshot = await db.collection(COLLECTION).where('status', '==', 'Current').get();
    if (snapshot.empty) {
      const msg = 'No current videos to archive.';
      if (isHttp) return res.status(200).json({ ok: true, archived: 0, message: msg });
      console.log(msg);
      return { archived: 0, quarter: label };
    }

    const copyOperations = [];
    const enrichments = [];

    for (const doc of snapshot.docs) {
      const data = doc.data() || {};
      if (!data.active_url) continue;

      const filePath = parseObjectPath(data.active_url);
      if (!filePath) continue;
      const fileName = filePath.split('/').pop();
      const destination = `${archivePrefix}${fileName}`;

      copyOperations.push({
        source: filePath,
        destination,
        docRef: doc.ref,
        data,
        docId: doc.id,
      });

      // Optional Kimi enrichment (no-op when ENABLE_KIMI_ENRICHMENT != true)
      // eslint-disable-next-line no-await-in-loop
      const enrichment = await aiGateway.enrichVideoMetadata(data.transcript || '', doc.id);
      if (enrichment) enrichments.push({ ref: doc.ref, enrichment });
    }

    await Promise.all(
      copyOperations.map(async (op) => {
        const sourceFile = bucket.file(op.source);
        const destFile = bucket.file(op.destination);
        const [exists] = await sourceFile.exists();
        if (!exists) {
          console.warn(`Skip missing source: ${op.source}`);
          return;
        }
        await sourceFile.copy(destFile);
        console.log(`Archived: ${op.source} -> ${op.destination}`);
      })
    );

    const batch = db.batch();
    for (const op of copyOperations) {
      batch.update(op.docRef, {
        status: 'Archived',
        archive_url: `gs://${BUCKET}/${op.destination}`,
        archive_quarter: label,
        archived_at: FieldValue.serverTimestamp(),
      });
    }
    for (const row of enrichments) {
      batch.update(row.ref, row.enrichment);
    }
    await batch.commit();

    // New-generation hook reserved for VEO/OpenAI pipeline (disabled until masters ready).
    console.log('Video generation hook skipped (script-based masters only).');

    const out = {
      ok: true,
      archived: copyOperations.length,
      enriched: enrichments.length,
      quarter: label,
      prefix: archivePrefix,
    };
    if (isHttp) return res.status(200).json(out);
    return out;
  } catch (error) {
    console.error('Refresh failed:', error);
    if (isHttp) return res.status(500).json({ error: error.message || 'Refresh failed' });
    throw error;
  }
}

/** Pub/Sub CloudEvent wrapper for onMessagePublished. */
async function refreshVideosPubSub(event) {
  console.log('refreshVideos Pub/Sub trigger', event && event.id ? event.id : '');
  return refreshVideos(null, null);
}

module.exports = {
  refreshVideos,
  refreshVideosPubSub,
  parseObjectPath,
  quarterLabel,
};
