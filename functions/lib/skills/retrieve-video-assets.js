/**
 * Skill: retrieve-video-assets — list catalog title/status/bucket path.
 * Uses existing videoCatalog module (Firestore + fallback). No new deps.
 */
'use strict';

const videoCatalog = require('../../videoCatalog');

function bucketPath(video) {
  const v = video || {};
  for (const key of [
    'bucket_path',
    'gcs_path',
    'gs_uri',
    'storagePath',
    'storage_path',
    'master_path',
    'url_mp4_en',
    'url_mp4',
    'url',
  ]) {
    if (v[key]) return String(v[key]);
  }
  const id = v.video_id || v.id || '';
  return id ? `gs://resumora-videos/masters/${id}` : '—';
}

function titleOf(video) {
  const v = video || {};
  return String(v.title_EN || v.title || v.name || v.video_id || v.id || 'untitled');
}

function statusOf(video) {
  const v = video || {};
  return String(
    v.status || v.publish_status || v.state || (v.source === 'fallback' ? 'fallback' : 'available')
  );
}

async function runRetrieveVideoAssets() {
  const catalog = await videoCatalog.getCatalog();
  const videos = Array.isArray(catalog.videos) ? catalog.videos : [];
  const rows = videos.map((v) => ({
    video_id: String(v.video_id || v.id || ''),
    title: titleOf(v),
    status: statusOf(v),
    bucket_path: bucketPath(v),
  }));
  const lines = rows.map((r, i) => `${i + 1}. ${r.title} | ${r.status} | ${r.bucket_path}`);
  return {
    skill: 'retrieve-video-assets',
    source: catalog.source || null,
    count: rows.length,
    videos: rows,
    reply:
      lines.length > 0
        ? `Video library (${rows.length}):\n${lines.join('\n')}`
        : 'Video library is empty.',
  };
}

module.exports = { runRetrieveVideoAssets, bucketPath, titleOf, statusOf };
