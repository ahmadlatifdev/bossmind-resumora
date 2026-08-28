/**
 * Firestore-triggered social publisher (publishing_queue/{jobId}).
 * Uses Secret Manager-injected env only — never logs tokens/cookies.
 */

const path = require('path');
const { Storage } = require('@google-cloud/storage');
const { FieldValue } = require('firebase-admin/firestore');
const { OAuth2Client } = require('google-auth-library');
const bilibiliPublish = require('./bilibiliPublish');

const BUCKET = process.env.GCS_BUCKET_NAME || 'resumora-videos';

function log(step, extra = {}) {
  console.log(JSON.stringify({ scope: 'publishToSocial', step, ...extra }));
}

function hasBilibiliCreds() {
  return Boolean(
    process.env.BILIBILI_SESSDATA &&
    process.env.BILIBILI_BILI_JCT &&
    process.env.BILIBILI_DEDE_USER_ID
  );
}

function hasYouTubeCreds() {
  return Boolean(
    process.env.YOUTUBE_CLIENT_ID &&
    process.env.YOUTUBE_CLIENT_SECRET &&
    process.env.YOUTUBE_REFRESH_TOKEN
  );
}

function hasMetaCreds() {
  return Boolean(process.env.META_PAGE_ACCESS_TOKEN && process.env.META_PAGE_ID);
}

function hasLinkedInCreds() {
  return Boolean(process.env.LINKEDIN_ACCESS_TOKEN && process.env.LINKEDIN_ORG_ID);
}

function hasTikTokCreds() {
  return Boolean(process.env.TIKTOK_ACCESS_TOKEN);
}

function hasXCreds() {
  return Boolean(process.env.X_API_KEY && process.env.X_API_SECRET && process.env.X_ACCESS_TOKEN);
}

async function downloadGcs(gcsPath) {
  const storage = new Storage();
  const object = String(gcsPath || '').replace(/^gs:\/\/[^/]+\//, '');
  const [buf] = await storage.bucket(BUCKET).file(object).download();
  return { buffer: buf, object, fileName: path.basename(object) };
}

async function ensureOutboxCopy(srcObject, destObject) {
  const storage = new Storage();
  const src = storage.bucket(BUCKET).file(srcObject);
  const [exists] = await src.exists();
  if (!exists) throw new Error(`GCS object missing: ${srcObject}`);
  await src.copy(storage.bucket(BUCKET).file(destObject));
  return destObject;
}

async function publishBilibili(job) {
  if (!hasBilibiliCreds()) {
    return { status: 'awaiting_credentials', detail: 'bilibili_cookies_missing' };
  }
  const master =
    job.gcsLandscape || job.gcsMaster || (job.videoId ? `masters/${job.videoId}-en.mp4` : '');
  if (!master) throw new Error('No gcsLandscape/gcsMaster for Bilibili');

  const dest = `bilibili-outbox/${job.videoId || 'video'}/${path.basename(master)}`;
  await ensureOutboxCopy(String(master).replace(/^gs:\/\/[^/]+\//, ''), dest);

  // Dynamic require of db via caller — publish uses bilibili module with temporary db inject
  return { status: 'ready_for_bilibili', dest };
}

async function youtubeAccessToken() {
  const client = new OAuth2Client(process.env.YOUTUBE_CLIENT_ID, process.env.YOUTUBE_CLIENT_SECRET);
  client.setCredentials({ refresh_token: process.env.YOUTUBE_REFRESH_TOKEN });
  const tok = await client.getAccessToken();
  const token = tok && tok.token ? tok.token : null;
  if (!token) throw new Error('YouTube access token unavailable');
  return token;
}

/**
 * Resumable YouTube upload (Data API v3).
 */
async function publishYouTube(job) {
  if (!hasYouTubeCreds()) {
    return { status: 'awaiting_credentials', detail: 'youtube_oauth_missing' };
  }
  const src = job.gcsLandscape || job.gcsMaster;
  if (!src) throw new Error('No landscape/master path for YouTube');
  const { buffer, fileName } = await downloadGcs(src);
  const accessToken = await youtubeAccessToken();

  const metadata = {
    snippet: {
      title: String(job.title || fileName).slice(0, 100),
      description: String(job.description || 'https://resumora.net').slice(0, 5000),
      tags: Array.isArray(job.tags) ? job.tags.slice(0, 15) : ['Resumora', 'resume'],
      categoryId: String(process.env.YOUTUBE_CATEGORY_ID || '27'),
    },
    status: {
      privacyStatus: String(process.env.YOUTUBE_PRIVACY || 'unlisted'),
      selfDeclaredMadeForKids: false,
    },
  };

  const initRes = await fetch(
    'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json; charset=UTF-8',
        'X-Upload-Content-Length': String(buffer.length),
        'X-Upload-Content-Type': 'video/mp4',
      },
      body: JSON.stringify(metadata),
    }
  );
  if (!initRes.ok) {
    const t = (await initRes.text()).slice(0, 200);
    throw new Error(`YouTube init failed HTTP ${initRes.status}: ${t}`);
  }
  const uploadUrl = initRes.headers.get('location');
  if (!uploadUrl) throw new Error('YouTube resumable URL missing');

  const putRes = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'video/mp4',
      'Content-Length': String(buffer.length),
    },
    body: buffer,
  });
  const putJson = await putRes.json().catch(() => ({}));
  if (!putRes.ok) {
    throw new Error(`YouTube upload failed HTTP ${putRes.status}`);
  }
  log('youtube_published', { videoId: putJson.id || null });
  return { status: 'published', externalId: putJson.id || null, platform: 'youtube' };
}

async function publishMeta(job, kind) {
  if (!hasMetaCreds()) {
    return { status: 'awaiting_credentials', detail: 'meta_token_missing' };
  }
  // Graph API video upload to Page — host file via public GCS URL
  const src =
    kind === 'vertical' ? job.gcsVertical || job.gcsLandscape : job.gcsLandscape || job.gcsMaster;
  if (!src) throw new Error('No media path for Meta');
  const object = String(src).replace(/^gs:\/\/[^/]+\//, '');
  const fileUrl = `https://storage.googleapis.com/${BUCKET}/${object}`;
  const pageId = process.env.META_PAGE_ID;
  const token = process.env.META_PAGE_ACCESS_TOKEN;
  const endpoint = `https://graph.facebook.com/v19.0/${pageId}/videos`;
  const body = new URLSearchParams({
    file_url: fileUrl,
    title: String(job.title || '').slice(0, 255),
    description: String(job.description || 'https://resumora.net').slice(0, 2000),
    access_token: token,
  });
  const res = await fetch(endpoint, { method: 'POST', body });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.error) {
    throw new Error(
      `Meta upload failed: ${String(json.error && json.error.message).slice(0, 160)}`
    );
  }
  log('meta_published', { kind, id: json.id || null });
  return {
    status: 'published',
    externalId: json.id || null,
    platform: kind === 'vertical' ? 'instagram' : 'facebook',
  };
}

async function publishLinkedIn(job) {
  if (!hasLinkedInCreds()) {
    return { status: 'awaiting_credentials', detail: 'linkedin_token_missing' };
  }
  // LinkedIn video upload is multi-step; queue as ready when token present but use UGC text+link fallback for reliability
  const org = process.env.LINKEDIN_ORG_ID;
  const token = process.env.LINKEDIN_ACCESS_TOKEN;
  const src = job.gcsLandscape || job.gcsMaster;
  const object = String(src || '').replace(/^gs:\/\/[^/]+\//, '');
  const fileUrl = object
    ? `https://storage.googleapis.com/${BUCKET}/${object}`
    : 'https://resumora.net/videos';
  const res = await fetch('https://api.linkedin.com/v2/ugcPosts', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'X-Restli-Protocol-Version': '2.0.0',
    },
    body: JSON.stringify({
      author: `urn:li:organization:${org}`,
      lifecycleState: 'PUBLISHED',
      specificContent: {
        'com.linkedin.ugc.ShareContent': {
          shareCommentary: {
            text: `${job.title || 'Resumora'}\n\n${job.description || ''}\n${fileUrl}`.slice(
              0,
              3000
            ),
          },
          shareMediaCategory: 'ARTICLE',
          media: [
            {
              status: 'READY',
              originalUrl: fileUrl,
              title: { text: String(job.title || 'Resumora').slice(0, 200) },
            },
          ],
        },
      },
      visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' },
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`LinkedIn post failed HTTP ${res.status}`);
  }
  log('linkedin_published', { id: json.id || null });
  return { status: 'published', externalId: json.id || null, platform: 'linkedin' };
}

async function publishTikTokOrX(platform) {
  if (platform === 'tiktok' && !hasTikTokCreds()) {
    return { status: 'awaiting_credentials', detail: 'tiktok_token_missing' };
  }
  if (platform === 'x' && !hasXCreds()) {
    return { status: 'awaiting_credentials', detail: 'x_token_missing' };
  }
  // Full binary upload APIs vary by app review status — record ready job for ops when tokens exist
  return {
    status: 'awaiting_api_scope',
    detail: `${platform}_upload_requires_approved_app_scopes`,
  };
}

/**
 * Process one publishing_queue document.
 * @param {FirebaseFirestore.Firestore} db
 * @param {string} jobId
 * @param {object} job
 */
async function processPublishingJob(db, jobId, job) {
  const status = String(job.status || '').toLowerCase();
  if (status && status !== 'pending' && status !== 'retry') {
    log('skip_status', { jobId, status });
    return { skipped: true, reason: status };
  }

  const ref = db.collection('publishing_queue').doc(jobId);
  await ref.set(
    {
      status: 'processing',
      updatedAt: FieldValue.serverTimestamp(),
      startedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  const platforms =
    Array.isArray(job.platforms) && job.platforms.length
      ? job.platforms
      : ['youtube', 'facebook', 'instagram', 'linkedin', 'tiktok', 'x', 'bilibili'];

  const results = {};
  let publishedCount = 0;
  let awaiting = 0;
  let failed = 0;

  for (const platform of platforms) {
    try {
      let out;
      if (platform === 'bilibili') {
        const prep = await publishBilibili(job);
        if (prep.status === 'awaiting_credentials') {
          out = prep;
        } else {
          const pub = await bilibiliPublish.publishGcsObjectToBilibili(db, {
            bucket: BUCKET,
            name: prep.dest,
            contentType: 'video/mp4',
            metadata: {
              title: job.title,
              bilibiliTitle: job.title,
            },
          });
          out = {
            status: pub.skipped ? 'skipped' : 'published',
            externalId: pub.bvid || null,
            platform: 'bilibili',
            notes:
              'Enable AI translation / AI Voice in Bilibili Creator for ZH localization after publish.',
          };
        }
      } else if (platform === 'youtube') {
        out = await publishYouTube(job);
      } else if (platform === 'facebook') {
        out = await publishMeta(job, 'horizontal');
      } else if (platform === 'instagram') {
        out = await publishMeta(job, 'vertical');
      } else if (platform === 'linkedin') {
        out = await publishLinkedIn(job);
      } else if (platform === 'tiktok' || platform === 'x') {
        out = await publishTikTokOrX(platform);
      } else {
        out = { status: 'skipped', detail: 'unknown_platform' };
      }

      results[platform] = out;
      if (out.status === 'published') publishedCount += 1;
      else if (String(out.status).startsWith('awaiting')) awaiting += 1;
      log('platform_result', { jobId, platform, status: out.status });
    } catch (err) {
      failed += 1;
      results[platform] = {
        status: 'failed',
        error: String(err && err.message ? err.message : err).slice(0, 240),
      };
      log('platform_failed', {
        jobId,
        platform,
        error: String(err && err.message ? err.message : err).slice(0, 160),
      });
    }
  }

  let finalStatus = 'published';
  if (publishedCount === 0 && failed > 0 && awaiting === 0) finalStatus = 'failed';
  else if (publishedCount === 0 && awaiting > 0) finalStatus = 'awaiting_credentials';
  else if (publishedCount > 0 && (failed > 0 || awaiting > 0)) finalStatus = 'partial';
  else if (publishedCount === platforms.length) finalStatus = 'published';

  await ref.set(
    {
      status: finalStatus,
      results,
      publishedCount,
      awaitingCount: awaiting,
      failedCount: failed,
      updatedAt: FieldValue.serverTimestamp(),
      completedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  await db.collection('media_publish_metrics').add({
    jobId,
    videoId: job.videoId || null,
    status: finalStatus,
    publishedCount,
    awaitingCount: awaiting,
    failedCount: failed,
    source: 'publishToSocial',
    createdAt: FieldValue.serverTimestamp(),
  });

  log('job_complete', { jobId, finalStatus, publishedCount, awaiting, failed });
  return { status: finalStatus, results };
}

module.exports = {
  processPublishingJob,
  hasBilibiliCreds,
  hasYouTubeCreds,
  hasMetaCreds,
  hasLinkedInCreds,
};
