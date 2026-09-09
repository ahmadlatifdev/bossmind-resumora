/**
 * Pillar 2 — enrich video_registry docs when created or marked Current.
 * Writes video_metadata/{videoId} and denormalizes enrichment_status on the parent.
 *
 * FFmpeg thumbnail + Speech-to-Text audio extract are deferred (need video-processor).
 * This path uses Gemini on title/seed (+ existing transcript if present).
 */
'use strict';

const { onDocumentWritten } = require('firebase-functions/v2/firestore');
const { defineSecret } = require('firebase-functions/params');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { generateVideoMetadata } = require('../lib/videoEnrichmentAi');

const region = 'us-central1';
const COLLECTION = process.env.VIDEO_REGISTRY_COLLECTION || 'video_registry';
const META_COLLECTION = 'video_metadata';
const geminiApiKey = defineSecret('GEMINI_API_KEY');

function shouldEnrich(before, after) {
  if (!after) return false;
  const status = String(after.status || 'Current');
  if (status !== 'Current') return false;

  const prevStatus = before ? String(before.status || '') : '';
  const created = !before;
  const becameCurrent = Boolean(before) && prevStatus !== 'Current' && status === 'Current';
  const force = after.enrichment_force === true;

  if (force) return true;
  if (created || becameCurrent) {
    const st = String(after.enrichment_status || '');
    if (st === 'processing' || st === 'ready') return false;
    return true;
  }
  return false;
}

async function runEnrichment(db, videoId, data) {
  const docRef = db.collection(COLLECTION).doc(videoId);
  await docRef.set(
    {
      enrichment_status: 'processing',
      enrichment_error: FieldValue.delete(),
      enrichment_started_at: FieldValue.serverTimestamp(),
      enrichment_force: FieldValue.delete(),
    },
    { merge: true }
  );

  const title = String(data.title || data.title_EN || data.name || videoId);
  const seedText = [
    data.description,
    data.description_EN,
    Array.isArray(data.tags) ? data.tags.join(', ') : '',
    data.script_path ? `script: ${data.script_path}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  const existingTranscript = String(data.transcript || '').trim();

  let generated;
  try {
    generated = await generateVideoMetadata({
      title,
      seedText,
      existingTranscript,
      timeoutMs: 45000,
    });
  } catch (err) {
    await docRef.set(
      {
        enrichment_status: 'failed',
        enrichment_error: String(err.message || 'enrichment failed').slice(0, 500),
        enrichment_updated_at: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    throw err;
  }

  const meta = {
    videoId,
    transcript: generated.transcript || '',
    summary: generated.summary || '',
    chapters: generated.chapters || [],
    tags: generated.tags || [],
    thumbnail_url: data.thumbnail_url || data.thumbnail || null,
    thumbnail_pending: !(data.thumbnail_url || data.thumbnail),
    enrichment_provider: generated.provider || 'gemini',
    enrichment_mode: existingTranscript ? 'transcript_refine' : 'title_seed',
    speech_to_text: 'deferred',
    ffmpeg_thumbnail: 'deferred',
    updated_at: FieldValue.serverTimestamp(),
  };

  await db.collection(META_COLLECTION).doc(videoId).set(meta, { merge: true });

  await docRef.set(
    {
      enrichment_status: 'ready',
      enrichment_error: FieldValue.delete(),
      enrichment_summary: meta.summary,
      enrichment_tags: meta.tags,
      enrichment_updated_at: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  return meta;
}

async function enrichVideoMetadataHandler(event) {
  const videoId = event.params.videoId;
  const before = event.data.before.exists ? event.data.before.data() : null;
  const after = event.data.after.exists ? event.data.after.data() : null;

  if (!shouldEnrich(before, after)) {
    return null;
  }

  // Avoid re-entry loops: only proceed when status is not already processing
  // unless enrichment_force was set (cleared inside runEnrichment).
  if (after && after.enrichment_status === 'processing' && after.enrichment_force !== true) {
    return null;
  }

  const db = getFirestore();
  console.log(`enrichVideoMetadata start videoId=${videoId}`);
  try {
    const meta = await runEnrichment(db, videoId, after || {});
    console.log(`enrichVideoMetadata ready videoId=${videoId} tags=${(meta.tags || []).length}`);
    return { ok: true, videoId };
  } catch (err) {
    console.error(`enrichVideoMetadata failed videoId=${videoId}`, err.message || err);
    return { ok: false, videoId, error: String(err.message || err) };
  }
}

function registerEnrichVideoMetadata(exportsObj) {
  exportsObj.enrichVideoMetadata = onDocumentWritten(
    {
      document: `${COLLECTION}/{videoId}`,
      region,
      timeoutSeconds: 120,
      memory: '512MiB',
      secrets: [geminiApiKey],
    },
    enrichVideoMetadataHandler
  );
}

module.exports = {
  registerEnrichVideoMetadata,
  runEnrichment,
  shouldEnrich,
  META_COLLECTION,
};
