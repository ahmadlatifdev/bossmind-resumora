/**
 * Hourly admin analytics aggregator (Firestore snapshots in admin_analytics).
 */
'use strict';

const { onSchedule } = require('firebase-functions/v2/scheduler');
const { onRequest } = require('firebase-functions/v2/https');
const { getFirestore } = require('firebase-admin/firestore');
const { computeAndStoreAnalytics } = require('../lib/adminVideoAnalytics');

const region = 'us-central1';

async function runCompute() {
  const db = getFirestore();
  return computeAndStoreAnalytics(db);
}

function registerComputeAnalytics(exportsObj) {
  exportsObj.computeAnalytics = onSchedule(
    {
      schedule: '0 * * * *',
      timeZone: 'UTC',
      region,
      timeoutSeconds: 120,
      memory: '256MiB',
    },
    async () => {
      const out = await runCompute();
      console.log(`computeAnalytics ok date=${out.id} current=${out.videosCurrent}`);
    }
  );

  /** Manual ops trigger (private). */
  exportsObj.computeAnalyticsHttp = onRequest(
    {
      region,
      cors: false,
      timeoutSeconds: 120,
      memory: '256MiB',
      invoker: 'private',
    },
    async (req, res) => {
      if (req.method !== 'POST' && req.method !== 'GET') {
        res.status(405).json({ error: 'Method not allowed' });
        return;
      }
      try {
        const out = await runCompute();
        res.status(200).json({ ok: true, snapshot: out });
      } catch (err) {
        console.error('computeAnalyticsHttp', err.message || err);
        res.status(500).json({ error: err.message || 'Compute failed' });
      }
    }
  );
}

module.exports = { registerComputeAnalytics, runCompute };
