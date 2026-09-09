/**
 * Firestore `video_registry` helpers — Current/Archived listing + restore.
 */
'use strict';

const { FieldValue } = require('firebase-admin/firestore');
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

function serializeDoc(doc) {
  const data = doc.data() || {};
  const status = String(data.status || 'Current');
  let archiveQuarter = data.archive_quarter ? String(data.archive_quarter) : '';
  if (!archiveQuarter && data.archive_url) {
    const m = String(data.archive_url).match(/archive\/([^/]+)\//i);
    if (m) archiveQuarter = m[1];
  }
  return {
    id: doc.id,
    doc_id: doc.id,
    title: String(data.title || data.title_EN || data.name || doc.id),
    status,
    active_url: data.active_url ? String(data.active_url) : '',
    archive_url: data.archive_url ? String(data.archive_url) : '',
    archive_quarter: archiveQuarter,
    archived_at: data.archived_at || null,
    restored_at: data.restored_at || null,
    video_id: String(data.video_id || doc.id),
  };
}

async function listVideoRegistry(db, { status = 'Current' } = {}) {
  const wanted = String(status || 'Current').trim() === 'Archived' ? 'Archived' : 'Current';
  let snap;
  try {
    if (wanted === 'Archived') {
      snap = await db
        .collection(COLLECTION)
        .where('status', '==', 'Archived')
        .orderBy('archived_at', 'desc')
        .limit(200)
        .get();
    } else {
      snap = await db.collection(COLLECTION).where('status', '==', 'Current').limit(200).get();
    }
  } catch (err) {
    // Fallback if composite index not ready yet.
    snap = await db.collection(COLLECTION).where('status', '==', wanted).limit(200).get();
  }
  const videos = snap.docs.map(serializeDoc);
  return { status: wanted, count: videos.length, videos };
}

async function restoreRegistryVideo(db, docId) {
  const id = String(docId || '').trim();
  if (!id) {
    throw Object.assign(new Error('Missing docId'), { statusCode: 400 });
  }
  const docRef = db.collection(COLLECTION).doc(id);
  const doc = await docRef.get();
  if (!doc.exists) {
    throw Object.assign(new Error('Video not found'), { statusCode: 404 });
  }
  const data = doc.data() || {};
  if (data.status !== 'Archived') {
    throw Object.assign(new Error('Video is not archived'), { statusCode: 400 });
  }
  const archiveUrl = data.archive_url;
  if (!archiveUrl) {
    throw Object.assign(new Error('Missing archive_url'), { statusCode: 400 });
  }

  const filePath = parseObjectPath(archiveUrl);
  const fileName = filePath.split('/').pop();
  const activePath = `active/${fileName}`;
  const bucket = getStorage().bucket(BUCKET);
  const sourceFile = bucket.file(filePath);
  const [exists] = await sourceFile.exists();
  if (!exists) {
    throw Object.assign(new Error('Archive object missing in GCS'), { statusCode: 404 });
  }
  await sourceFile.copy(bucket.file(activePath));

  await db.runTransaction(async (transaction) => {
    const fresh = await transaction.get(docRef);
    if (!fresh.exists || fresh.data().status !== 'Archived') {
      throw Object.assign(new Error('Status changed during restore'), { statusCode: 409 });
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

  return {
    ok: true,
    message: 'Restore successful',
    newUrl: `gs://${BUCKET}/${activePath}`,
    docId: id,
  };
}

module.exports = {
  COLLECTION,
  BUCKET,
  listVideoRegistry,
  restoreRegistryVideo,
  parseObjectPath,
  serializeDoc,
};
