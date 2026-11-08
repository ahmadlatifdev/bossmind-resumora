/**
 * Cinematic video factory endpoints:
 *   - triggerCinematicJob : HTTP POST { jobId } — kick off HeyGen render
 *   - heyGenWebhook       : HeyGen render-complete callback — advance to assembly
 *   - advanceCinematicJob : HTTP POST { jobId } — manual/scheduler poll
 */
'use strict';

const { onRequest } = require('firebase-functions/v2/https');
const { getFirestore } = require('firebase-admin/firestore');
const { triggerCinematicJob, advanceCinematicJob, reportError } = require('./lib/cinematicJobs');
const { exportManualAssemblyZip } = require('./lib/manualAssembly');
const veed = require('./lib/veed');

function cors(res) {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

function registerCinematicEndpoints(exports) {
  exports.triggerCinematicJob = onRequest(
    { region: 'us-central1', cors: false, timeoutSeconds: 60, memory: '256MiB' },
    async (req, res) => {
      cors(res);
      if (req.method === 'OPTIONS') return res.status(204).send('');
      if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
      const db = getFirestore();
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
      const jobId = String(body.jobId || '').trim();
      if (!jobId) return res.status(400).json({ error: 'jobId is required' });
      try {
        const out = await triggerCinematicJob(db, jobId);
        res.status(200).json({ ok: true, ...out });
      } catch (err) {
        reportError({ jobId }, err);
        res.status(500).json({ error: err.message || 'trigger failed' });
      }
    }
  );

  exports.heyGenWebhook = onRequest(
    { region: 'us-central1', cors: false, timeoutSeconds: 60, memory: '256MiB' },
    async (req, res) => {
      cors(res);
      if (req.method === 'OPTIONS') return res.status(204).send('');
      if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
      const db = getFirestore();
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
      const jobId = String(body.jobId || body.job_id || '').trim();
      if (!jobId) return res.status(400).json({ error: 'jobId is required' });
      try {
        const out = await advanceCinematicJob(db, jobId);
        res.status(200).json({ ok: true, ...out });
      } catch (err) {
        reportError({ jobId }, err);
        res.status(500).json({ error: err.message || 'advance failed' });
      }
    }
  );

  exports.advanceCinematicJob = onRequest(
    { region: 'us-central1', cors: false, timeoutSeconds: 540, memory: '256MiB' },
    async (req, res) => {
      cors(res);
      if (req.method === 'OPTIONS') return res.status(204).send('');
      if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
      const db = getFirestore();
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
      const jobId = String(body.jobId || '').trim();
      if (!jobId) return res.status(400).json({ error: 'jobId is required' });
      try {
        const out = await advanceCinematicJob(db, jobId);
        res.status(200).json({ ok: true, ...out });
      } catch (err) {
        reportError({ jobId }, err);
        res.status(500).json({ error: err.message || 'advance failed' });
      }
    }
  );

  // Manual Assembly Queue — one-click ZIP export (script + manifest + README).
  exports.exportManualAssemblyZip = onRequest(
    { region: 'us-central1', cors: false, timeoutSeconds: 60, memory: '512MiB' },
    async (req, res) => {
      cors(res);
      if (req.method === 'OPTIONS') return res.status(204).send('');
      if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
      const db = getFirestore();
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
      const jobId = String(body.jobId || '').trim();
      if (!jobId) return res.status(400).json({ error: 'jobId is required' });
      try {
        const out = await exportManualAssemblyZip(db, jobId);
        res.status(200).json({ ok: true, ...out });
      } catch (err) {
        reportError({ jobId }, err);
        res.status(500).json({ error: err.message || 'export failed' });
      }
    }
  );

  // VEED render submit — returns 503 when VEED Enterprise API is not configured,
  // signalling the frontend to use the Manual Assembly Queue instead.
  exports.submitVeedRender = onRequest(
    { region: 'us-central1', cors: false, timeoutSeconds: 120, memory: '256MiB' },
    async (req, res) => {
      cors(res);
      if (req.method === 'OPTIONS') return res.status(204).send('');
      if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
      if (!veed.apiKey()) {
        return res
          .status(503)
          .json({ ok: false, fallback: 'manual_assembly', error: 'VEED_API_KEY not configured' });
      }
      const db = getFirestore();
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
      const jobId = String(body.jobId || '').trim();
      if (!jobId) return res.status(400).json({ error: 'jobId is required' });
      try {
        const snap = await db.collection('cinematic_jobs').doc(jobId).get();
        const job = snap.exists ? snap.data() || {} : {};
        const renderId = await veed.submitRender({
          script: job.scriptText || job.script,
          audioUrl: job.heygenVideoUrl || null,
          avatarUrl: job.heygenVideoUrl || null,
          brollUrls: job.brollUrls || [],
        });
        await db
          .collection('cinematic_jobs')
          .doc(jobId)
          .set({ state: 'VEED_RENDERING', veedRenderId: renderId }, { merge: true });
        res.status(200).json({ ok: true, renderId, state: 'VEED_RENDERING' });
      } catch (err) {
        reportError({ jobId }, err);
        res.status(500).json({ error: err.message || 'VEED submit failed' });
      }
    }
  );
}

module.exports = { registerCinematicEndpoints };
