/**
 * Register video archival Cloud Functions (refresh + restore).
 */
'use strict';

const { onRequest } = require('firebase-functions/v2/https');
const { onMessagePublished } = require('firebase-functions/v2/pubsub');
const { refreshVideos, refreshVideosPubSub } = require('./refreshVideos');
const { restoreVideo } = require('./restoreVideo');

const region = 'us-central1';

function registerVideoArchiveExports(exportsObj) {
  /** Quarterly archival — Pub/Sub from Cloud Scheduler refresh-videos-cron. */
  exportsObj.refreshVideos = onMessagePublished(
    {
      topic: 'refresh-videos-topic',
      region,
      timeoutSeconds: 540,
      memory: '512MiB',
    },
    async (event) => refreshVideosPubSub(event)
  );

  /** Manual HTTP trigger for archival (ops / admin). Not public — invoke with identity. */
  exportsObj.refreshVideosHttp = onRequest(
    {
      region,
      cors: false,
      timeoutSeconds: 540,
      memory: '512MiB',
      invoker: 'private',
    },
    refreshVideos
  );

  /** Instant restore — HTTP, private invoker (use admin IAM / authenticated call). */
  exportsObj.restoreVideo = onRequest(
    {
      region,
      cors: false,
      timeoutSeconds: 120,
      memory: '256MiB',
      invoker: 'private',
    },
    restoreVideo
  );
}

module.exports = { registerVideoArchiveExports };
