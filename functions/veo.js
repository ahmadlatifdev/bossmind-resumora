/**
 * Google Vertex AI Veo 3 video generation for resumora.net.
 * Uses Application Default Credentials and/or VEO_SERVICE_ACCOUNT_JSON (Secret Manager).
 * Never logs credential JSON or access tokens.
 *
 * Agentic orchestration (planning → execute → verify → capped retries → fallback)
 * lives in `functions/videoAgent.js` (`runVideoGenerationAgent`) and is invoked from
 * `generateGoogleVideo` when `agent: true`, or via `/api/video/agent-generate`.
 */

const { GoogleAuth } = require('google-auth-library');
const { Storage } = require('@google-cloud/storage');
const { randomUUID } = require('crypto');

const PROJECT_ID = String(
  process.env.GCLOUD_PROJECT ||
    process.env.GCP_PROJECT ||
    process.env.GOOGLE_CLOUD_PROJECT ||
    'resumora-live'
).trim();
const LOCATION = String(process.env.VEO_LOCATION || 'us-central1').trim();
const MODEL_ID = String(process.env.VEO_MODEL_ID || 'veo-3.1-fast-generate-001').trim();
const OUTPUT_BUCKET = String(
  process.env.GCS_BUCKET_NAME || process.env.VEO_OUTPUT_BUCKET || `${PROJECT_ID}-veo-videos`
).trim();

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function parseServiceAccountJson() {
  const raw = String(
    process.env.VEO_SERVICE_ACCOUNT_KEY || process.env.VEO_SERVICE_ACCOUNT_JSON || ''
  ).trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (_) {
    const err = new Error('VEO_SERVICE_ACCOUNT_KEY is not valid JSON');
    err.code = 'CONFIG';
    throw err;
  }
}

function getGoogleAuth() {
  const credentials = parseServiceAccountJson();
  const scopes = ['https://www.googleapis.com/auth/cloud-platform'];
  if (credentials) {
    return new GoogleAuth({ credentials, scopes, projectId: PROJECT_ID });
  }
  return new GoogleAuth({ scopes, projectId: PROJECT_ID });
}

function hasSaJsonEnv() {
  return Boolean(
    String(process.env.VEO_SERVICE_ACCOUNT_KEY || process.env.VEO_SERVICE_ACCOUNT_JSON || '').trim()
  );
}

function getStorage() {
  const credentials = parseServiceAccountJson();
  if (credentials) {
    return new Storage({ credentials, projectId: PROJECT_ID });
  }
  return new Storage({ projectId: PROJECT_ID });
}

async function getAccessToken() {
  // Local DevOps: prefer gcloud user token when no SA JSON is bound (avoids stale ADC/reauth).
  if (!hasSaJsonEnv()) {
    try {
      const { spawnSync } = require('child_process');
      const r = spawnSync(
        process.platform === 'win32' ? 'gcloud.cmd' : 'gcloud',
        ['auth', 'print-access-token', `--project=${PROJECT_ID}`],
        { encoding: 'utf8', shell: true }
      );
      const token = String(r.stdout || '')
        .trim()
        .split(/\r?\n/)
        .filter(Boolean)
        .pop();
      if (r.status === 0 && token && !token.toLowerCase().includes('error')) return token;
    } catch (_) {
      /* fall through */
    }
  }

  try {
    const auth = getGoogleAuth();
    const client = await auth.getClient();
    const tokenResponse = await client.getAccessToken();
    const token =
      typeof tokenResponse === 'string' ? tokenResponse : tokenResponse && tokenResponse.token;
    if (token) return token;
  } catch (_) {
    /* fall through */
  }

  const err = new Error('Unable to obtain Google access token for Vertex AI');
  err.code = 'AUTH';
  throw err;
}

function modelBaseUrl() {
  return `https://${LOCATION}-aiplatform.googleapis.com/v1/projects/${PROJECT_ID}/locations/${LOCATION}/publishers/google/models/${MODEL_ID}`;
}

function publicHttpsFromGs(gsUri) {
  const m = String(gsUri || '').match(/^gs:\/\/([^/]+)\/(.+)$/);
  if (!m) return null;
  return `https://storage.googleapis.com/${m[1]}/${encodeURI(m[2]).replace(/%2F/g, '/')}`;
}

async function ensureBucketExists(storage) {
  // Local ops without SA JSON: do not touch Storage SDK (stale ADC). Assume bucket exists
  // (created by setup-video-localizer / setup-veo). Vertex writes via storageUri using user token.
  if (!hasSaJsonEnv()) {
    return null;
  }

  const bucket = storage.bucket(OUTPUT_BUCKET);
  const [exists] = await bucket.exists();
  if (!exists) {
    await storage.createBucket(OUTPUT_BUCKET, {
      location: LOCATION,
      uniformBucketLevelAccess: true,
    });
  }
  return bucket;
}

/**
 * Optional: upload a reference image (base64) to GCS for image-to-video.
 * @returns {Promise<{ gcsUri: string, mimeType: string }|null>}
 */
async function uploadReferenceImage({ imageBase64, mimeType }) {
  const b64 = String(imageBase64 || '')
    .replace(/^data:[^;]+;base64,/, '')
    .trim();
  if (!b64) return null;
  const mime = String(mimeType || 'image/png').trim() || 'image/png';
  const ext =
    mime.includes('jpeg') || mime.includes('jpg') ? 'jpg' : mime.includes('webp') ? 'webp' : 'png';
  const storage = getStorage();
  const bucket = await ensureBucketExists(storage);
  const objectPath = `veo-inputs/${new Date().toISOString().slice(0, 10)}/${randomUUID()}.${ext}`;
  const file = bucket.file(objectPath);
  await file.save(Buffer.from(b64, 'base64'), {
    contentType: mime,
    resumable: false,
    metadata: { cacheControl: 'private, max-age=3600' },
  });
  return { gcsUri: `gs://${OUTPUT_BUCKET}/${objectPath}`, mimeType: mime };
}

/**
 * Start a Veo long-running predict operation.
 * @param {{ prompt: string, imageBase64?: string, mimeType?: string, imageGcsUri?: string, durationSeconds?: number, aspectRatio?: string, resolution?: string }} opts
 */
async function startVideoGeneration(opts) {
  const prompt = String(opts.prompt || '').trim();
  if (!prompt || prompt.length < 8) {
    const err = new Error('prompt is required (min 8 characters)');
    err.code = 'BAD_REQUEST';
    throw err;
  }

  const storage = hasSaJsonEnv() ? getStorage() : null;
  await ensureBucketExists(storage);
  const outPrefix = `veo-outputs/${new Date().toISOString().slice(0, 10)}/${randomUUID()}`;
  const storageUri = `gs://${OUTPUT_BUCKET}/${outPrefix}/`;

  const instance = { prompt };
  let imageMeta = null;
  if (opts.imageGcsUri) {
    imageMeta = {
      gcsUri: String(opts.imageGcsUri),
      mimeType: String(opts.mimeType || 'image/png'),
    };
  } else if (opts.imageBase64) {
    imageMeta = await uploadReferenceImage({
      imageBase64: opts.imageBase64,
      mimeType: opts.mimeType,
    });
  }
  if (imageMeta) {
    instance.image = {
      gcsUri: imageMeta.gcsUri,
      mimeType: imageMeta.mimeType,
    };
  }

  const durationSeconds = [4, 6, 8].includes(Number(opts.durationSeconds))
    ? Number(opts.durationSeconds)
    : 8;
  const aspectRatio = opts.aspectRatio === '9:16' ? '9:16' : '16:9';
  const resolution = opts.resolution === '720p' ? '720p' : '1080p';

  const token = await getAccessToken();
  const url = `${modelBaseUrl()}:predictLongRunning`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify({
      instances: [instance],
      parameters: {
        storageUri,
        sampleCount: 1,
        durationSeconds,
        aspectRatio,
        resolution,
        personGeneration: 'allow_adult',
      },
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(
      data.error?.message || data.message || `Vertex Veo start failed (${res.status})`
    );
    err.code = res.status === 403 || res.status === 401 ? 'AUTH' : 'UPSTREAM';
    err.status = res.status;
    throw err;
  }
  const operationName = data.name || data.operation?.name;
  if (!operationName) {
    const err = new Error('Vertex Veo did not return an operation name');
    err.code = 'UPSTREAM';
    throw err;
  }
  return {
    operationName,
    storageUri,
    modelId: MODEL_ID,
    projectId: PROJECT_ID,
  };
}

/**
 * One poll of fetchPredictOperation.
 */
async function fetchOperationOnce(operationName) {
  const token = await getAccessToken();
  const url = `${modelBaseUrl()}:fetchPredictOperation`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify({ operationName }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(
      data.error?.message || data.message || `Vertex Veo status failed (${res.status})`
    );
    err.code = 'UPSTREAM';
    err.status = res.status;
    throw err;
  }
  return data;
}

function extractVideos(op) {
  const response = op.response || op;
  const videos = response.videos || response.generatedSamples || [];
  return Array.isArray(videos) ? videos : [];
}

async function makeObjectPublicIfPossible(gsUri) {
  const m = String(gsUri || '').match(/^gs:\/\/([^/]+)\/(.+)$/);
  if (!m) return publicHttpsFromGs(gsUri);
  if (!hasSaJsonEnv()) {
    // Skip SDK makePublic locally — download uses gcloud storage cp instead.
    return publicHttpsFromGs(gsUri);
  }
  try {
    const storage = getStorage();
    const file = storage.bucket(m[1]).file(m[2]);
    await file.makePublic();
  } catch (_) {
    /* uniform bucket IAM may block makePublic — still return HTTPS URL */
  }
  return publicHttpsFromGs(gsUri);
}

/**
 * Poll until done (or timeout), then return public HTTPS URL.
 */
async function pollUntilReady(operationName, { maxWaitMs = 480000, intervalMs = 5000 } = {}) {
  const started = Date.now();
  let delay = intervalMs;
  while (Date.now() - started < maxWaitMs) {
    const op = await fetchOperationOnce(operationName);
    if (op.done) {
      if (op.error) {
        const err = new Error(op.error.message || 'Veo generation failed');
        err.code = 'UPSTREAM';
        throw err;
      }
      const videos = extractVideos(op);
      const first = videos[0] || {};
      const gsUri = first.gcsUri || first.uri || null;
      if (!gsUri) {
        const err = new Error('Veo completed but no GCS video URI was returned');
        err.code = 'UPSTREAM';
        throw err;
      }
      const videoUrl = await makeObjectPublicIfPossible(gsUri);
      return {
        status: 'completed',
        done: true,
        operationName,
        gcsUri: gsUri,
        videoUrl,
        mimeType: first.mimeType || 'video/mp4',
        engine: 'veo',
        modelId: MODEL_ID,
      };
    }
    await sleep(delay);
    delay = Math.min(15000, Math.round(delay * 1.25));
  }
  const err = new Error('Veo generation timed out — poll with operationName');
  err.code = 'TIMEOUT';
  err.operationName = operationName;
  throw err;
}

/**
 * Full generate: start + poll + public URL.
 */
async function generateAndWait(opts) {
  const started = await startVideoGeneration(opts);
  if (opts.wait === false) {
    return {
      status: 'pending',
      done: false,
      operationName: started.operationName,
      storageUri: started.storageUri,
      engine: 'veo',
      modelId: MODEL_ID,
    };
  }
  try {
    return await pollUntilReady(started.operationName, {
      maxWaitMs: Number(opts.maxWaitMs) || 480000,
    });
  } catch (err) {
    if (err.code === 'TIMEOUT') {
      return {
        status: 'pending',
        done: false,
        operationName: started.operationName,
        storageUri: started.storageUri,
        engine: 'veo',
        modelId: MODEL_ID,
        message: err.message,
      };
    }
    throw err;
  }
}

async function getStatus(operationName) {
  const name = String(operationName || '').trim();
  if (!name) {
    const err = new Error('operationName is required');
    err.code = 'BAD_REQUEST';
    throw err;
  }
  const op = await fetchOperationOnce(name);
  if (!op.done) {
    return { status: 'processing', done: false, operationName: name, engine: 'veo' };
  }
  if (op.error) {
    return {
      status: 'failed',
      done: true,
      operationName: name,
      error: op.error.message || 'Veo failed',
      engine: 'veo',
    };
  }
  const videos = extractVideos(op);
  const first = videos[0] || {};
  const gsUri = first.gcsUri || first.uri || null;
  if (!gsUri) {
    return {
      status: 'failed',
      done: true,
      operationName: name,
      error: 'No video URI in response',
      engine: 'veo',
    };
  }
  const videoUrl = await makeObjectPublicIfPossible(gsUri);
  return {
    status: 'completed',
    done: true,
    operationName: name,
    gcsUri: gsUri,
    videoUrl,
    mimeType: first.mimeType || 'video/mp4',
    engine: 'veo',
    modelId: MODEL_ID,
  };
}

module.exports = {
  PROJECT_ID,
  LOCATION,
  MODEL_ID,
  OUTPUT_BUCKET,
  startVideoGeneration,
  generateAndWait,
  getStatus,
  pollUntilReady,
};
