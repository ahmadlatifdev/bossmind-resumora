/**
 * Phase 3 — daily video embeddings for Current video_registry docs.
 */
'use strict';

const { onSchedule } = require('firebase-functions/v2/scheduler');
const { onRequest } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { embedText, buildVideoEmbedText } = require('../lib/embeddings');

const region = 'us-central1';
const COLLECTION = process.env.VIDEO_REGISTRY_COLLECTION || 'video_registry';
const geminiApiKey = defineSecret('GEMINI_API_KEY');
const RECOMPUTE_MS = 7 * 24 * 60 * 60 * 1000;

function needsEmbedding(data) {
  if (!Array.isArray(data.embedding) || !data.embedding.length) return true;
  const at = data.embedding_updated_at;
  const ms = at?.toMillis?.() || (at ? Date.parse(String(at)) : 0);
  if (!ms) return true;
  return Date.now() - ms > RECOMPUTE_MS;
}

async function runComputeEmbeddings({ limit = 40 } = {}) {
  const db = getFirestore();
  const snap = await db.collection(COLLECTION).where('status', '==', 'Current').limit(200).get();
  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (const doc of snap.docs) {
    if (updated >= limit) break;
    const data = doc.data() || {};
    if (!needsEmbedding(data)) {
      skipped += 1;
      continue;
    }
    const text = buildVideoEmbedText(data);
    if (!text) {
      skipped += 1;
      continue;
    }
    try {
      const { values, provider, dims } = await embedText(text);
      await doc.ref.set(
        {
          embedding: values,
          embedding_dims: dims,
          embedding_provider: provider,
          embedding_updated_at: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
      updated += 1;
    } catch (err) {
      failed += 1;
      console.error(`embed fail ${doc.id}:`, err.message || err);
    }
  }

  return { ok: true, scanned: snap.size, updated, skipped, failed };
}

function registerComputeEmbeddings(exportsObj) {
  const common = {
    region,
    timeoutSeconds: 540,
    memory: '512MiB',
    secrets: [geminiApiKey],
  };

  exportsObj.computeEmbeddings = onSchedule(
    {
      ...common,
      schedule: '0 2 * * *',
      timeZone: 'UTC',
    },
    async () => {
      const out = await runComputeEmbeddings({ limit: 80 });
      console.log('computeEmbeddings', JSON.stringify(out));
    }
  );

  exportsObj.computeEmbeddingsHttp = onRequest(
    { ...common, cors: false, invoker: 'private' },
    async (req, res) => {
      if (req.method !== 'POST' && req.method !== 'GET') {
        res.status(405).json({ error: 'Method not allowed' });
        return;
      }
      try {
        const limit = parseInt(String(req.query.limit || '40'), 10);
        const out = await runComputeEmbeddings({ limit });
        res.status(200).json(out);
      } catch (err) {
        res.status(500).json({ error: err.message || 'Embeddings failed' });
      }
    }
  );
}

module.exports = { registerComputeEmbeddings, runComputeEmbeddings, needsEmbedding };
