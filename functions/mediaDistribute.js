/**
 * Unified media distribution orchestrator (GCS finalize → platforms).
 * Bilibili: live upload via bilibiliPublish.
 * YouTube / Meta / TikTok / LinkedIn / X: queue Firestore jobs until API secrets exist.
 * Never logs cookie/API secret values.
 */

const path = require('path');
const { Storage } = require('@google-cloud/storage');
const { FieldValue } = require('firebase-admin/firestore');
const bilibiliPublish = require('./bilibiliPublish');

const BUCKET = 'resumora-videos';
const DEFAULT_PREFIX = 'distribute-outbox/';

function log(step, extra = {}) {
  console.log(JSON.stringify({ scope: 'mediaDistribute', step, ...extra }));
}

function distributePrefix() {
  return String(process.env.MEDIA_DISTRIBUTE_PREFIX || DEFAULT_PREFIX)
    .replace(/^\/+/, '')
    .replace(/\/?$/, '/');
}

function isVideoPath(name, contentType) {
  const n = String(name || '').toLowerCase();
  const ct = String(contentType || '').toLowerCase();
  if (/thumbnail|thumb|\.jpg$|\.jpeg$|\.png$|\.webp$|\.json$|\.vtt$|\.srt$/i.test(n)) return false;
  if (ct.startsWith('video/')) return true;
  return /\.(mp4|webm|mov|mkv)$/i.test(n);
}

function detectPlatformHint(filePath) {
  const base = path.basename(String(filePath || '')).toLowerCase();
  if (base.includes('shorts') || base.includes('9x16') || base.includes('vertical')) {
    return ['tiktok', 'instagram', 'shorts', 'x'];
  }
  if (base.includes('landscape') || base.includes('16x9')) {
    return ['youtube', 'facebook', 'linkedin', 'bilibili'];
  }
  return ['youtube', 'facebook', 'linkedin', 'bilibili', 'tiktok', 'instagram', 'x'];
}

function platformCredentialsStatus() {
  return {
    bilibili: Boolean(
      process.env.BILIBILI_SESSDATA &&
      process.env.BILIBILI_BILI_JCT &&
      process.env.BILIBILI_DEDE_USER_ID
    ),
    youtube: Boolean(
      process.env.YOUTUBE_REFRESH_TOKEN &&
      process.env.YOUTUBE_CLIENT_ID &&
      process.env.YOUTUBE_CLIENT_SECRET
    ),
    meta: Boolean(process.env.META_PAGE_ACCESS_TOKEN && process.env.META_PAGE_ID),
    tiktok: Boolean(process.env.TIKTOK_ACCESS_TOKEN),
    linkedin: Boolean(process.env.LINKEDIN_ACCESS_TOKEN && process.env.LINKEDIN_ORG_ID),
    x: Boolean(process.env.X_API_KEY && process.env.X_API_SECRET && process.env.X_ACCESS_TOKEN),
  };
}

async function upsertLibraryAsset(db, { videoId, filePath, contentType, platforms, metadata }) {
  const ref = db
    .collection('media_library')
    .doc(videoId || Buffer.from(filePath).toString('base64url').slice(0, 120));
  await ref.set(
    {
      videoId: videoId || null,
      gcsPath: filePath,
      bucket: BUCKET,
      contentType: contentType || null,
      platforms: platforms || [],
      metadata: metadata || {},
      brandUrl: 'https://resumora.net',
      updatedAt: FieldValue.serverTimestamp(),
      createdAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
  return ref.id;
}

async function queuePlatformJob(db, job) {
  const ref = await db.collection('media_publish_jobs').add({
    ...job,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  return ref.id;
}

async function recordAnalyticsEvent(db, event) {
  await db.collection('media_publish_metrics').add({
    ...event,
    source: 'mediaDistribute',
    createdAt: FieldValue.serverTimestamp(),
  });
}

/**
 * Process a finalized GCS object under distribute-outbox/.
 */
async function distributeGcsObject(db, objectMeta) {
  const filePath = String(objectMeta.name || '');
  const contentType = String(objectMeta.contentType || '');
  const prefix = distributePrefix();

  log('event_received', { filePath, contentType: contentType || null });

  if (!filePath.startsWith(prefix)) {
    log('skip_prefix', { prefix });
    return { skipped: true, reason: 'prefix' };
  }
  if (!isVideoPath(filePath, contentType)) {
    // Still register captions/thumbs as sidecar assets
    if (/\.(vtt|srt|jpg|jpeg|png|json)$/i.test(filePath)) {
      const videoId = filePath.split('/')[1] || 'unknown';
      await upsertLibraryAsset(db, {
        videoId: `${videoId}-sidecar`,
        filePath,
        contentType,
        platforms: [],
        metadata: { kind: 'sidecar' },
      });
      log('sidecar_indexed', { filePath });
      return { skipped: true, reason: 'sidecar_indexed' };
    }
    log('skip_non_video', { filePath });
    return { skipped: true, reason: 'non_video' };
  }

  const parts = filePath.split('/');
  const videoId = parts[1] || path.basename(filePath, path.extname(filePath));
  const platforms = detectPlatformHint(filePath);
  const creds = platformCredentialsStatus();
  const title = String(
    (objectMeta.metadata && (objectMeta.metadata.title || objectMeta.metadata.bilibiliTitle)) ||
      videoId.replace(/[-_]/g, ' ')
  ).slice(0, 80);
  const description = String(
    (objectMeta.metadata && objectMeta.metadata.description) || `${title} — https://resumora.net`
  ).slice(0, 2000);

  await upsertLibraryAsset(db, {
    videoId,
    filePath,
    contentType,
    platforms,
    metadata: { title, description },
  });

  const results = [];

  for (const platform of platforms) {
    if (platform === 'bilibili') {
      if (!creds.bilibili) {
        const jobId = await queuePlatformJob(db, {
          platform: 'bilibili',
          status: 'queued_awaiting_credentials',
          gcsPath: filePath,
          videoId,
          title,
          description,
          notes:
            'Set BILIBILI_SESSDATA / BILIBILI_BILI_JCT / BILIBILI_DEDE_USER_ID in Secret Manager. Enable AI translation / AI Voice in Bilibili creator studio for ZH localization.',
        });
        results.push({ platform, status: 'queued_awaiting_credentials', jobId });
        log('bilibili_queued_no_creds', { jobId });
        continue;
      }
      try {
        // Reuse Bilibili uploader against this object (bypass bilibili-outbox prefix by copying logic path)
        const storage = new Storage();
        const dest = `bilibili-outbox/${videoId}/${path.basename(filePath)}`;
        await storage.bucket(BUCKET).file(filePath).copy(storage.bucket(BUCKET).file(dest));
        log('bilibili_copy_outbox', { dest });
        const pub = await bilibiliPublish.publishGcsObjectToBilibili(db, {
          bucket: BUCKET,
          name: dest,
          contentType,
          generation: objectMeta.generation,
          size: objectMeta.size,
          metadata: { title, bilibiliTitle: title },
        });
        await recordAnalyticsEvent(db, {
          platform: 'bilibili',
          videoId,
          status: pub.skipped ? 'skipped' : 'published',
          bvid: pub.bvid || null,
          gcsPath: filePath,
        });
        results.push({
          platform,
          status: pub.skipped ? 'skipped' : 'published',
          bvid: pub.bvid || null,
        });
      } catch (err) {
        const jobId = await queuePlatformJob(db, {
          platform: 'bilibili',
          status: 'failed',
          gcsPath: filePath,
          videoId,
          error: String(err && err.message ? err.message : err).slice(0, 300),
        });
        results.push({ platform, status: 'failed', jobId });
        log('bilibili_failed', { error: String(err.message || err).slice(0, 160) });
      }
      continue;
    }

    // Other networks: queue until OAuth secrets exist (honest automation gate)
    const ready =
      (platform === 'youtube' && creds.youtube) ||
      ((platform === 'facebook' || platform === 'instagram') && creds.meta) ||
      (platform === 'tiktok' && creds.tiktok) ||
      (platform === 'linkedin' && creds.linkedin) ||
      ((platform === 'x' || platform === 'shorts') && (creds.x || creds.youtube));

    const status = ready ? 'queued_ready' : 'queued_awaiting_credentials';
    const jobId = await queuePlatformJob(db, {
      platform,
      status,
      gcsPath: filePath,
      videoId,
      title,
      description,
      brandUrl: 'https://resumora.net',
      notes:
        platform === 'youtube'
          ? 'Provide YOUTUBE_CLIENT_ID / YOUTUBE_CLIENT_SECRET / YOUTUBE_REFRESH_TOKEN secrets to enable API upload.'
          : `Provide ${platform} API secrets in Secret Manager to enable auto-post.`,
    });
    await recordAnalyticsEvent(db, {
      platform,
      videoId,
      status,
      gcsPath: filePath,
      jobId,
    });
    results.push({ platform, status, jobId });
    log('platform_job', { platform, status, jobId });
  }

  log('distribute_complete', { videoId, results: results.length });
  return { skipped: false, videoId, results };
}

module.exports = {
  distributeGcsObject,
  distributePrefix,
  platformCredentialsStatus,
};
