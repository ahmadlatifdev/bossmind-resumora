/**
 * Optional Kimi K3 enrichment gateway (offline / RunPod).
 * Disabled unless ENABLE_KIMI_ENRICHMENT=true. Never blocks archival on failure.
 */
'use strict';

const { getStorage } = require('firebase-admin/storage');

class AIGateway {
  constructor(opts = {}) {
    this.bucketName = opts.bucket || process.env.VIDEO_ARCHIVE_BUCKET || 'resumora-videos';
    this.primaryEndpoint =
      opts.primaryEndpoint || process.env.KIMI_ENDPOINT || 'https://api.runpod.ai/v1/kimi-k3';
    this.fallbackEndpoint =
      opts.fallbackEndpoint ||
      process.env.KIMI_FALLBACK_ENDPOINT ||
      'https://api.eu.runpod.ai/v1/kimi-k3';
    this.timeout = Number(opts.timeout || process.env.KIMI_TIMEOUT_MS || 8000);
    this.enabled = String(process.env.ENABLE_KIMI_ENRICHMENT || '').toLowerCase() === 'true';
  }

  async enrichVideoMetadata(transcriptText, videoId) {
    if (!this.enabled) {
      console.log('Kimi enrichment disabled, skipping.');
      return null;
    }

    const text = String(transcriptText || '').trim();
    if (!text) return null;

    const apiKey = String(process.env.RUNPOD_API_KEY || '').trim();
    if (!apiKey) {
      console.warn('ENABLE_KIMI_ENRICHMENT=true but RUNPOD_API_KEY missing; skip.');
      return null;
    }

    let file = null;
    try {
      const fileName = `temp/kimi_${videoId}_${Date.now()}.txt`;
      file = getStorage().bucket(this.bucketName).file(fileName);
      await file.save(text, { contentType: 'text/plain', resumable: false });
      const [url] = await file.getSignedUrl({
        action: 'read',
        expires: Date.now() + 15 * 60 * 1000,
      });

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeout);
      let response;
      try {
        response = await fetch(`${this.primaryEndpoint}/run`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            input: {
              file_url: url,
              task: 'Analyze this interview transcript. Extract: sentiment (positive/neutral/negative), 5 main topics, and a 3-sentence summary.',
            },
          }),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timer);
      }

      if (!response.ok) {
        throw new Error(`Kimi API error: ${response.status}`);
      }
      const result = await response.json();
      if (!result.output || typeof result.output !== 'object') {
        throw new Error('Invalid response structure from Kimi');
      }

      await file.delete().catch(() => {});

      return {
        kimi_sentiment: result.output.sentiment || 'neutral',
        kimi_topics: Array.isArray(result.output.topics) ? result.output.topics : [],
        kimi_summary: result.output.summary || '',
        kimi_processed_at: new Date().toISOString(),
      };
    } catch (error) {
      console.error('Kimi enrichment failed, falling back gracefully:', error.message || error);
      if (file) await file.delete().catch(() => {});
      return null;
    }
  }
}

module.exports = { AIGateway };
