/**
 * Bilibili publish pipeline (GCS → Bilibili member upload).
 * Auth cookies come from Secret Manager / env — never hard-code or log cookie values.
 *
 * Flow:
 *  1) preupload → auth, endpoint, upos_uri, chunk_size, biz_id
 *  2) init upload_id
 *  3) PUT chunks with X-Upos-Auth
 *  4) merge parts
 *  5) submit metadata (title/desc) via /x/vu/web/add
 */

const path = require('path');
const { getStorage } = require('firebase-admin/storage');
const { FieldValue } = require('firebase-admin/firestore');

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const VIDEO_CONTENT_TYPES = new Set([
  'video/mp4',
  'video/webm',
  'video/quicktime',
  'video/x-msvideo',
  'video/x-matroska',
  'application/octet-stream',
]);

const VIDEO_EXTS = new Set(['.mp4', '.webm', '.mov', '.avi', '.mkv', '.flv']);

function logStep(level, step, extra = {}) {
  const line = JSON.stringify({
    scope: 'bilibiliPublish',
    step,
    ...extra,
  });
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

function readCookieBundle() {
  const SESSDATA = String(process.env.BILIBILI_SESSDATA || process.env.SESSDATA || '').trim();
  const bili_jct = String(
    process.env.BILIBILI_BILI_JCT || process.env.bili_jct || process.env.BILI_JCT || ''
  ).trim();
  const DedeUserID = String(
    process.env.BILIBILI_DEDE_USER_ID || process.env.DedeUserID || process.env.DEDE_USER_ID || ''
  ).trim();
  return { SESSDATA, bili_jct, DedeUserID };
}

function cookieHeader({ SESSDATA, bili_jct, DedeUserID }) {
  const parts = [];
  if (SESSDATA) parts.push(`SESSDATA=${SESSDATA}`);
  if (bili_jct) parts.push(`bili_jct=${bili_jct}`);
  if (DedeUserID) parts.push(`DedeUserID=${DedeUserID}`);
  return parts.join('; ');
}

function cookiesConfigured(bundle) {
  return Boolean(bundle.SESSDATA && bundle.bili_jct && bundle.DedeUserID);
}

function uploadPrefix() {
  return String(process.env.BILIBILI_UPLOAD_PREFIX || 'bilibili-outbox/')
    .replace(/^\/+/, '')
    .replace(/\/?$/, '/');
}

function isVideoObject({ name, contentType }) {
  const filePath = String(name || '');
  const ct = String(contentType || '').toLowerCase();
  const ext = path.extname(filePath).toLowerCase();

  if (/thumbnail|thumbnails|\/thumbs?\//i.test(filePath)) return false;
  if (['.jpg', '.jpeg', '.png', '.webp', '.gif', '.json', '.txt', '.vtt', '.srt'].includes(ext)) {
    return false;
  }
  if (VIDEO_EXTS.has(ext)) return true;
  if (ct.startsWith('video/')) return true;
  if (VIDEO_CONTENT_TYPES.has(ct) && VIDEO_EXTS.has(ext)) return true;
  return false;
}

function titleFromObjectPath(filePath, customTitle) {
  if (customTitle && String(customTitle).trim()) return String(customTitle).trim().slice(0, 80);
  const base = path.basename(String(filePath || 'resumora-video'), path.extname(filePath || ''));
  return base.replace(/[_-]+/g, ' ').trim().slice(0, 80) || 'Resumora video';
}

function descriptionFromEnv(filePath) {
  const tmpl =
    process.env.BILIBILI_DEFAULT_DESCRIPTION ||
    'Published automatically from Resumora (resumora.net). Source: {filePath}';
  let text = String(tmpl)
    .replace(/\{filePath\}/g, String(filePath || ''))
    .slice(0, 1800);
  if (String(process.env.BILIBILI_ENABLE_AI_VOICE || 'true').toLowerCase() !== 'false') {
    text +=
      '\n\n[Resumora] Enable Bilibili AI translation / AI Voice in creator tools for Chinese localization.';
  }
  return text.slice(0, 2000);
}

function tidFromEnv() {
  const n = Number(process.env.BILIBILI_TID || 21);
  return Number.isFinite(n) && n > 0 ? n : 21;
}

async function fetchJson(url, options = {}) {
  const res = await fetch(url, options);
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { ok: res.ok, status: res.status, json, text: text.slice(0, 400) };
}

function uposUploadUrl(endpoint, uposUri) {
  const host = String(endpoint || '')
    .replace(/^\/\//, '')
    .replace(/\/$/, '');
  const objectPath = String(uposUri || '').replace(/^upos:\/\//, '');
  return `https://${host}/${objectPath}`;
}

async function uploadBufferToBilibili(fileBuffer, opts) {
  const { fileName, title, description, cookies } = opts;
  const size = fileBuffer.length;
  const cookie = cookieHeader(cookies);
  const commonHeaders = {
    Cookie: cookie,
    'User-Agent': UA,
    Referer: 'https://member.bilibili.com',
    Origin: 'https://member.bilibili.com',
  };

  const preQs = new URLSearchParams({
    name: fileName,
    size: String(size),
    r: 'upos',
    profile: 'ugcupos/bup',
    ssl: '0',
    version: '2.14.0',
    build: '2140000',
    webVersion: '2.0.0',
  });
  logStep('info', 'preupload_start', { fileName, size });
  const pre = await fetchJson(`https://member.bilibili.com/preupload?${preQs}`, {
    method: 'GET',
    headers: commonHeaders,
  });
  if (!pre.ok || !pre.json || Number(pre.json.OK) !== 1) {
    logStep('error', 'preupload_failed', { status: pre.status, body: pre.text });
    throw new Error(`Bilibili preupload failed (HTTP ${pre.status})`);
  }

  const auth = pre.json.auth;
  const endpoint = pre.json.endpoint;
  const uposUri = pre.json.upos_uri;
  const chunkSize = Number(pre.json.chunk_size) || 4 * 1024 * 1024;
  const bizId = pre.json.biz_id;
  if (!auth || !endpoint || !uposUri) {
    logStep('error', 'preupload_missing_fields', {
      hasAuth: Boolean(auth),
      hasEndpoint: Boolean(endpoint),
    });
    throw new Error('Bilibili preupload missing auth/endpoint/upos_uri');
  }
  logStep('info', 'preupload_ok', {
    endpointHost: String(endpoint).slice(0, 48),
    hasUpos: Boolean(uposUri),
    chunkSize,
    bizId: bizId || null,
  });

  const uploadUrl = uposUploadUrl(endpoint, uposUri);

  const initQs = new URLSearchParams({
    uploads: '',
    output: 'json',
    profile: 'ugcupos/bup',
    filesize: String(size),
    partsize: String(chunkSize),
    biz_id: String(bizId || ''),
  });
  const init = await fetchJson(`${uploadUrl}?${initQs}`, {
    method: 'POST',
    headers: {
      ...commonHeaders,
      'X-Upos-Auth': auth,
    },
  });
  const uploadId = init.json && init.json.upload_id;
  if (!init.ok || !uploadId) {
    logStep('error', 'upload_id_failed', { status: init.status, body: init.text });
    throw new Error('Bilibili upload_id init failed');
  }
  logStep('info', 'upload_id_ok', { uploadIdPrefix: String(uploadId).slice(0, 8) });

  const totalParts = Math.ceil(size / chunkSize) || 1;
  const etags = [];
  for (let i = 0; i < totalParts; i += 1) {
    const start = i * chunkSize;
    const end = Math.min(start + chunkSize, size);
    const chunk = fileBuffer.subarray(start, end);
    const partNumber = i + 1;
    const partQs = new URLSearchParams({
      partNumber: String(partNumber),
      uploadId: String(uploadId),
      chunk: String(i),
      chunks: String(totalParts),
      size: String(chunk.length),
      start: String(start),
      end: String(end),
      total: String(size),
    });
    const putRes = await fetch(`${uploadUrl}?${partQs}`, {
      method: 'PUT',
      headers: {
        'X-Upos-Auth': auth,
        'Content-Type': 'application/octet-stream',
        'Content-Length': String(chunk.length),
        'User-Agent': UA,
      },
      body: chunk,
    });
    if (!putRes.ok) {
      const errText = (await putRes.text()).slice(0, 200);
      logStep('error', 'chunk_put_failed', { partNumber, status: putRes.status, body: errText });
      throw new Error(`Bilibili chunk upload failed part=${partNumber}`);
    }
    etags.push({ partNumber, eTag: `"${partNumber}"` });
    if (partNumber === 1 || partNumber === totalParts || partNumber % 5 === 0) {
      logStep('info', 'chunk_put_ok', { partNumber, totalParts });
    }
  }

  const mergeQs = new URLSearchParams({
    output: 'json',
    name: fileName,
    profile: 'ugcupos/bup',
    uploadId: String(uploadId),
    biz_id: String(bizId || ''),
  });
  const mergeBody = JSON.stringify({
    parts: etags.map((p) => ({ partNumber: p.partNumber, eTag: p.eTag })),
  });
  const merge = await fetchJson(`${uploadUrl}?${mergeQs}`, {
    method: 'POST',
    headers: {
      ...commonHeaders,
      'X-Upos-Auth': auth,
      'Content-Type': 'application/json',
    },
    body: mergeBody,
  });
  if (!merge.ok || (merge.json && Number(merge.json.OK) !== 1 && merge.json.OK !== undefined)) {
    if (!merge.ok) {
      logStep('error', 'merge_failed', { status: merge.status, body: merge.text });
      throw new Error('Bilibili merge failed');
    }
  }
  logStep('info', 'merge_ok', { status: merge.status });

  const uposFile = String(uposUri)
    .replace(/^upos:\/\//, '')
    .split('/')
    .pop();
  const filename = uposFile || `${String(bizId)}.mp4`;

  const csrf = cookies.bili_jct;
  const submitPayload = {
    copyright: 1,
    videos: [
      {
        filename: filename.replace(/\.[^.]+$/, ''),
        title: title.slice(0, 80),
        desc: description.slice(0, 250),
      },
    ],
    source: '',
    tid: tidFromEnv(),
    cover: '',
    title: title.slice(0, 80),
    tag: String(process.env.BILIBILI_TAGS || 'Resumora,resume').slice(0, 200),
    desc_format_id: 0,
    desc: description.slice(0, 2000),
    dynamic: '',
    interactive: 0,
    no_reprint: 1,
    subtitle: { open: 0, lan: '' },
    dolby: 0,
    lossless_music: 0,
    csrf,
  };

  const submitUrl = `https://member.bilibili.com/x/vu/web/add/v3?csrf=${encodeURIComponent(csrf)}`;
  logStep('info', 'submit_start', { title: title.slice(0, 40), tid: tidFromEnv() });
  const submit = await fetchJson(submitUrl, {
    method: 'POST',
    headers: {
      ...commonHeaders,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(submitPayload),
  });

  const code = submit.json && typeof submit.json.code === 'number' ? submit.json.code : null;
  if (!submit.ok || code !== 0) {
    logStep('error', 'submit_failed', {
      status: submit.status,
      code,
      message:
        submit.json && submit.json.message
          ? String(submit.json.message).slice(0, 120)
          : submit.text,
    });
    throw new Error(`Bilibili submit failed code=${code}`);
  }

  const bvid = submit.json?.data?.bvid || null;
  const aid = submit.json?.data?.aid || null;
  logStep('info', 'submit_ok', { bvid, aid: aid || null });
  return { bvid, aid, filename, bizId };
}

async function publishGcsObjectToBilibili(db, objectMeta) {
  const bucketName = String(objectMeta.bucket || process.env.GCS_BUCKET_NAME || 'resumora-videos');
  const filePath = String(objectMeta.name || '');
  const contentType = String(objectMeta.contentType || '');
  const generation = String(objectMeta.generation || '');
  const size = Number(objectMeta.size || 0);

  logStep('info', 'event_received', {
    bucket: bucketName,
    filePath,
    contentType: contentType || null,
    size: size || null,
  });

  if (!filePath) {
    logStep('warn', 'skip_empty_path');
    return { skipped: true, reason: 'empty_path' };
  }

  const prefix = uploadPrefix();
  if (!filePath.startsWith(prefix)) {
    logStep('info', 'skip_prefix', { prefix, filePath });
    return { skipped: true, reason: 'prefix' };
  }

  if (!isVideoObject({ name: filePath, contentType })) {
    logStep('info', 'skip_non_video', { contentType: contentType || null, filePath });
    return { skipped: true, reason: 'non_video' };
  }

  const cookies = readCookieBundle();
  if (!cookiesConfigured(cookies)) {
    logStep('error', 'cookies_missing', {
      hasSessdata: Boolean(cookies.SESSDATA),
      hasBiliJct: Boolean(cookies.bili_jct),
      hasDedeUserId: Boolean(cookies.DedeUserID),
    });
    throw new Error('Bilibili cookies not configured (SESSDATA / bili_jct / DedeUserID)');
  }

  const docId = Buffer.from(`${bucketName}/${filePath}#${generation}`)
    .toString('base64url')
    .slice(0, 700);
  const logRef = db.collection('bilibili_publish_log').doc(docId);
  const existing = await logRef.get();
  if (existing.exists && existing.data() && existing.data().status === 'published') {
    logStep('info', 'skip_already_published', { filePath });
    return { skipped: true, reason: 'already_published', bvid: existing.data().bvid || null };
  }

  await logRef.set(
    {
      bucket: bucketName,
      filePath,
      contentType: contentType || null,
      generation: generation || null,
      status: 'uploading',
      updatedAt: FieldValue.serverTimestamp(),
      createdAt: existing.exists
        ? existing.data().createdAt || FieldValue.serverTimestamp()
        : FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  const [buffer] = await getStorage().bucket(bucketName).file(filePath).download();
  logStep('info', 'gcs_download_ok', { bytes: buffer.length });

  const fileName = path.basename(filePath) || 'video.mp4';
  const title = titleFromObjectPath(
    filePath,
    objectMeta.metadata && (objectMeta.metadata.bilibiliTitle || objectMeta.metadata.title)
  );
  const description = descriptionFromEnv(filePath);

  try {
    const result = await uploadBufferToBilibili(buffer, {
      fileName,
      title,
      description,
      cookies,
    });
    await logRef.set(
      {
        status: 'published',
        bvid: result.bvid || null,
        aid: result.aid || null,
        title,
        publishedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    logStep('info', 'publish_complete', { filePath, bvid: result.bvid || null });
    return { skipped: false, ...result, title };
  } catch (err) {
    await logRef.set(
      {
        status: 'failed',
        error: String(err && err.message ? err.message : err).slice(0, 300),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    logStep('error', 'publish_failed', {
      filePath,
      error: String(err && err.message ? err.message : err).slice(0, 200),
    });
    throw err;
  }
}

module.exports = {
  publishGcsObjectToBilibili,
  isVideoObject,
  uploadPrefix,
  readCookieBundle,
  cookiesConfigured,
  uploadBufferToBilibili,
};
