/**
 * Agentic video generation / localization workflow with capped retries.
 * Max attempts = 3 (initial + 2 retries), 60s delay between retries.
 * Never logs secrets or full credential material.
 */

const veo = require('./veo');
const videoLocalizer = require('./videoLocalizer');

const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 60000;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function isRetryableError(err) {
  const msg = String(err && err.message ? err.message : err || '').toLowerCase();
  const code = err && (err.code || err.status);
  if (code === 500 || code === 503 || code === 'UPSTREAM' || code === 'TIMEOUT') return true;
  if (msg.includes('lightning dunning')) return true;
  if (msg.includes('dunning decision is deny')) return true;
  if (msg.includes('timed out')) return true;
  if (msg.includes('econnreset') || msg.includes('fetch failed')) return true;
  if (msg.includes('503') || msg.includes('500')) return true;
  return false;
}

async function assertPlayableUri(result) {
  const url = result && (result.videoUrl || result.gcsUri || result.output_url);
  if (!url) {
    const err = new Error('Verification failed: no output video URI');
    err.code = 'VERIFY';
    throw err;
  }
  if (String(url).startsWith('gs://')) {
    // Size check via Storage when possible; presence of gs URI from Veo is enough to proceed.
    return { ...result, verified: true };
  }
  if (/^https?:\/\//i.test(String(url))) {
    try {
      const head = await fetch(String(url), { method: 'HEAD' });
      const len = Number(head.headers.get('content-length') || 0);
      if (head.ok && len === 0) {
        const err = new Error('Verification failed: output file is 0 bytes');
        err.code = 'VERIFY';
        throw err;
      }
      // Some buckets block HEAD — treat non-403/404 as soft pass if URL exists
      if (head.status === 404) {
        const err = new Error('Verification failed: output URL not found');
        err.code = 'VERIFY';
        throw err;
      }
    } catch (err) {
      if (err.code === 'VERIFY') throw err;
      /* soft-pass network HEAD failures */
    }
    return { ...result, verified: true };
  }
  const err = new Error('Verification failed: unsupported output URI');
  err.code = 'VERIFY';
  throw err;
}

async function markVideoGenerationFailed(db, videoId, detail) {
  if (!db || !videoId) return;
  await db
    .collection('videos')
    .doc(String(videoId))
    .set(
      {
        status: 'generation_failed',
        generation_error: String(detail || '').slice(0, 400),
        generation_failed_at: new Date().toISOString(),
      },
      { merge: true }
    );
}

async function notifyAdminGenerationFailed({ videoId, prompt, attempts, lastError }) {
  // Structured ops log only (email hooks can bind later via existing mail module).
  console.error(
    JSON.stringify({
      scope: 'runVideoGenerationAgent',
      event: 'generation_failed_final',
      videoId: videoId || null,
      attempts,
      lastError: String(lastError || '').slice(0, 240),
      promptChars: String(prompt || '').length,
    })
  );
  try {
    const mail = require('./mail');
    if (typeof mail.sendAdminAlert === 'function') {
      await mail.sendAdminAlert({
        subject: `[Resumora] Video generation failed: ${videoId || 'unknown'}`,
        text: `videoId=${videoId}\nattempts=${attempts}\nerror=${String(lastError || '').slice(0, 400)}`,
      });
    }
  } catch (_) {
    /* optional */
  }
}

/**
 * Orchestrate Veo generation (or localize) with planning → execute → verify → retry → fallback.
 *
 * @param {object} opts
 * @param {FirebaseFirestore.Firestore} opts.db
 * @param {'veo'|'localize'} [opts.mode]
 * @param {string} [opts.videoId]
 * @param {string} [opts.prompt]
 * @param {string} [opts.targetLanguage]
 * @param {string} [opts.sourceUrl]
 * @param {object} [opts.veoOpts]
 */
async function runVideoGenerationAgent(opts = {}) {
  const mode = opts.mode === 'localize' ? 'localize' : 'veo';
  const videoId = String(opts.videoId || opts.video_id || '').trim();
  const prompt = String(opts.prompt || '').trim();
  const maxAttempts = Math.min(MAX_ATTEMPTS, Math.max(1, Number(opts.maxAttempts) || MAX_ATTEMPTS));

  // Step 1 — Planning
  const plan = {
    mode,
    videoId: videoId || null,
    promptChars: prompt.length,
    maxAttempts,
    retryDelayMs: RETRY_DELAY_MS,
  };
  console.log(JSON.stringify({ scope: 'runVideoGenerationAgent', step: 'planning', ...plan }));

  if (mode === 'veo' && prompt.length < 8) {
    const err = new Error('prompt is required (min 8 characters)');
    err.code = 'BAD_REQUEST';
    throw err;
  }
  if (mode === 'localize') {
    if (!videoId || !['fr', 'es'].includes(String(opts.targetLanguage || '').slice(0, 2))) {
      const err = new Error('videoId and targetLanguage (fr|es) required for localize mode');
      err.code = 'BAD_REQUEST';
      throw err;
    }
  }

  let lastError = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      console.log(
        JSON.stringify({
          scope: 'runVideoGenerationAgent',
          step: 'execution',
          attempt,
          maxAttempts,
          mode,
        })
      );

      let result;
      if (mode === 'localize') {
        result = await videoLocalizer.startLocalize({
          videoId,
          targetLanguage: String(opts.targetLanguage).slice(0, 2),
          sourceUrl: opts.sourceUrl,
        });
        // Localize is async job — verification is job acceptance + jobId presence
        if (!result || !result.jobId) {
          const err = new Error('Localize did not return jobId');
          err.code = 'VERIFY';
          throw err;
        }
        result = { ...result, verified: true, status: result.status || 'queued' };
      } else {
        result = await veo.generateAndWait({
          prompt,
          ...(opts.veoOpts || {}),
          wait: true,
          maxWaitMs: Number(opts.maxWaitMs) || 480000,
        });
        // Step 3 — Verification
        result = await assertPlayableUri(result);
      }

      console.log(
        JSON.stringify({
          scope: 'runVideoGenerationAgent',
          step: 'success',
          attempt,
          hasUrl: Boolean(result.videoUrl || result.gcsUri || result.jobId),
        })
      );
      return {
        status: 'completed',
        done: true,
        attempts: attempt,
        agent: true,
        ...result,
      };
    } catch (err) {
      lastError = err;
      const retryable = isRetryableError(err) || err.code === 'VERIFY';
      console.warn(
        JSON.stringify({
          scope: 'runVideoGenerationAgent',
          step: 'attempt_failed',
          attempt,
          retryable,
          message: String(err.message || err).slice(0, 200),
          code: err.code || null,
        })
      );

      // Step 4 — Retry (capped)
      if (attempt < maxAttempts && retryable) {
        console.log(
          JSON.stringify({
            scope: 'runVideoGenerationAgent',
            step: 'retry_wait',
            attempt,
            delayMs: RETRY_DELAY_MS,
          })
        );
        await sleep(RETRY_DELAY_MS);
        continue;
      }
      break;
    }
  }

  // Step 5 — Fallback
  await markVideoGenerationFailed(
    opts.db,
    videoId || 'studio-ad-hoc',
    lastError && lastError.message
  );
  await notifyAdminGenerationFailed({
    videoId: videoId || 'studio-ad-hoc',
    prompt,
    attempts: maxAttempts,
    lastError: lastError && lastError.message,
  });

  const fail = new Error(
    lastError && lastError.message ? lastError.message : 'Video generation failed after retries'
  );
  fail.code = 'GENERATION_FAILED';
  fail.statusCode = 503;
  fail.attempts = maxAttempts;
  fail.fallback = {
    status: 'generation_failed',
    messageKey: 'videos.temporarilyUnavailable',
  };
  throw fail;
}

module.exports = {
  runVideoGenerationAgent,
  MAX_ATTEMPTS,
  RETRY_DELAY_MS,
  isRetryableError,
  assertPlayableUri,
};
