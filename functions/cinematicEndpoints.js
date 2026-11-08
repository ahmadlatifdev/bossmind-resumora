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
}

module.exports = { registerCinematicEndpoints };
