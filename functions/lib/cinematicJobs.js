/**
 * CinematicJob orchestrator + Guard-Ops state machine.
 *
 * States: QUEUED -> HEYGEN_RENDERING -> ASSEMBLY_IN_PROGRESS -> COMPLETED | FAILED
 *
 * Timeouts surface to Sentry when configured; otherwise structured console.error
 * feeds GCP Cloud Logging / Error Reporting.
 */
'use strict';

const { FieldValue } = require('firebase-admin/firestore');
const heygen = require('./heygen');

const COLLECTION = 'cinematic_jobs';
const STATES = Object.freeze([
  'QUEUED',
  'HEYGEN_RENDERING',
  'ASSEMBLY_IN_PROGRESS',
  'COMPLETED',
  'FAILED',
]);

// Step timeout (ms). HeyGen render is minutes; assembly is minutes.
const HEYGEN_TIMEOUT_MS = 2 * 60 * 60 * 1000;
const ASSEMBLY_TIMEOUT_MS = 30 * 60 * 1000;

function reportError(context, err) {
  const payload = {
    scope: 'cinematicJob',
    jobId: context.jobId || null,
    state: context.state || null,
    message: err && err.message ? err.message : String(err || 'unknown'),
  };
  console.error('[cinematicJob] error', JSON.stringify(payload));
  // If Sentry is wired on the backend, report here:
  //   Sentry.captureException(err, { tags: { jobId }, extra: payload });
}

async function setState(db, jobId, state, extra = {}) {
  if (!STATES.includes(state)) throw new Error(`Invalid state: ${state}`);
  await db
    .collection(COLLECTION)
    .doc(String(jobId))
    .set({ state, updatedAt: FieldValue.serverTimestamp(), ...extra }, { merge: true });
}

async function readJob(db, jobId) {
  const snap = await db.collection(COLLECTION).doc(String(jobId)).get();
  if (!snap.exists) throw new Error(`Cinematic job ${jobId} not found`);
  return snap.data() || {};
}

/** POST body to the Cloud Run assembly service (synchronous, returns GCS URL). */
async function callAssemblyService(assemblyUrl, payload, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${assemblyUrl}/assemble`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok)
      throw new Error(`Assembly failed (${res.status}): ${JSON.stringify(data).slice(0, 400)}`);
    return data;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Kick off a cinematic job:
 *   QUEUED -> submit HeyGen -> HEYGEN_RENDERING (store heygen_video_id)
 * Returns immediately; the render is long-running and must be advanced by
 * `advanceCinematicJob` (via HeyGen webhook or a scheduled poller).
 */
async function triggerCinematicJob(db, jobId) {
  const job = await readJob(db, jobId);
  const scriptText = String(job.scriptText || job.script || '');
  if (!scriptText) throw new Error(`Job ${jobId} has no scriptText`);

  const avatarId = String(job.avatarId || process.env.HEYGEN_AVATAR_ID || '');
  const voiceId = String(job.voiceId || process.env.HEYGEN_VOICE_ID || '');
  if (!avatarId) throw new Error(`Job ${jobId} has no avatarId`);

  await setState(db, jobId, 'HEYGEN_RENDERING', { startedAt: FieldValue.serverTimestamp() });

  const videoId = await heygen.submitAvatarVideo(scriptText, avatarId, { voiceId });
  await setState(db, jobId, 'HEYGEN_RENDERING', {
    heygenVideoId: videoId,
    heyGenSubmittedAt: FieldValue.serverTimestamp(),
  });

  return { jobId, state: 'HEYGEN_RENDERING', heygenVideoId: videoId };
}

/**
 * Advance a HEYGEN_RENDERING job:
 *   poll HeyGen -> on complete, call assembly -> ASSEMBLY_IN_PROGRESS -> COMPLETED
 * Intended to be invoked by a HeyGen webhook or a Cloud Scheduler poller.
 */
async function advanceCinematicJob(db, jobId) {
  const job = await readJob(db, jobId);
  if (job.state !== 'HEYGEN_RENDERING' || !job.heygenVideoId) {
    return { jobId, skipped: true, state: job.state };
  }

  const { status, videoUrl } = await heygen.getVideoStatus(job.heygenVideoId);
  if (status === 'failed' || status === 'error') {
    await setState(db, jobId, 'FAILED', { error: `HeyGen render failed (${status})` });
    return { jobId, state: 'FAILED' };
  }
  if (status !== 'completed' && status !== 'success') {
    return { jobId, state: 'HEYGEN_RENDERING', heyGenStatus: status };
  }

  const assemblyUrl = String(process.env.ASSEMBLY_SERVICE_URL || job.assemblyUrl || '');
  if (!assemblyUrl) {
    await setState(db, jobId, 'FAILED', { error: 'ASSEMBLY_SERVICE_URL not configured' });
    throw new Error('ASSEMBLY_SERVICE_URL not configured');
  }

  await setState(db, jobId, 'ASSEMBLY_IN_PROGRESS', { heygenVideoUrl: videoUrl });

  const out = await callAssemblyService(
    assemblyUrl,
    {
      jobId,
      avatarUrl: videoUrl,
      brollUrls: Array.isArray(job.brollUrls) ? job.brollUrls : [],
      bucket: job.outputBucket || 'resumora-videos',
      outputPath: job.outputPath || `masters/cinematic/${jobId}.mp4`,
    },
    ASSEMBLY_TIMEOUT_MS
  );

  await setState(db, jobId, 'COMPLETED', {
    finalUrl: out.url || out.gsUrl || null,
    completedAt: FieldValue.serverTimestamp(),
  });

  return { jobId, state: 'COMPLETED', finalUrl: out.url || out.gsUrl || null };
}

module.exports = {
  COLLECTION,
  STATES,
  HEYGEN_TIMEOUT_MS,
  ASSEMBLY_TIMEOUT_MS,
  triggerCinematicJob,
  advanceCinematicJob,
  setState,
  reportError,
};
