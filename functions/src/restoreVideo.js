/**
 * Instant restore API — copy archive/ object back to active/ and flip Firestore status.
 */
'use strict';

const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { getStorage } = require('firebase-admin/storage');

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

async function restoreVideo(req, res) {
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
    const docId = String(body.docId || body.doc_id || req.query.docId || '').trim();
    if (!docId) {
      res.status(400).json({ error: 'Missing docId' });
      return;
    }

    const db = getFirestore();
    const docRef = db.collection(COLLECTION).doc(docId);
    const doc = await docRef.get();
    if (!doc.exists) {
      res.status(404).json({ error: 'Video not found' });
      return;
    }

    const data = doc.data() || {};
    if (data.status !== 'Archived') {
      res.status(400).json({ error: 'Video is not archived' });
      return;
    }

    const archiveUrl = data.archive_url;
    if (!archiveUrl) {
      res.status(400).json({ error: 'No archive URL found' });
      return;
    }

    const filePath = parseObjectPath(archiveUrl);
    const fileName = filePath.split('/').pop();
    const activePath = `active/${fileName}`;
    const bucket = getStorage().bucket(BUCKET);
    const sourceFile = bucket.file(filePath);
    const destFile = bucket.file(activePath);

    const [exists] = await sourceFile.exists();
    if (!exists) {
      res.status(404).json({ error: 'Archive object missing in GCS' });
      return;
    }

    await sourceFile.copy(destFile);

    await db.runTransaction(async (transaction) => {
      const freshDoc = await transaction.get(docRef);
      if (!freshDoc.exists || freshDoc.data().status !== 'Archived') {
        throw Object.assign(new Error('Status changed during restore operation'), {
          statusCode: 409,
        });
      }
      transaction.update(docRef, {
        status: 'Current',
        active_url: `gs://${BUCKET}/${activePath}`,
        restored_at: FieldValue.serverTimestamp(),
        archive_url: FieldValue.delete(),
        archived_at: FieldValue.delete(),
        archive_quarter: FieldValue.delete(),
      });
    });

    res.status(200).json({
      ok: true,
      message: 'Video restored successfully',
      newUrl: `gs://${BUCKET}/${activePath}`,
    });
  } catch (error) {
    console.error('Restore failed:', error);
    const code = error.statusCode || 500;
    res.status(code).json({ error: error.message || 'Restore failed' });
  }
}

module.exports = { restoreVideo, parseObjectPath };
