/**
 * Phase 3 personalization exports (watch, embeddings, recommendations).
 */
'use strict';

const { registerOnVideoWatch } = require('./onVideoWatch');
const { registerComputeEmbeddings } = require('./computeEmbeddings');
const { registerComputeRecommendations } = require('./computeRecommendations');
const { registerGetRecommendations } = require('./getRecommendations');

function registerPersonalizationExports(exportsObj) {
  registerOnVideoWatch(exportsObj);
  registerComputeEmbeddings(exportsObj);
  registerComputeRecommendations(exportsObj);
  registerGetRecommendations(exportsObj);
}

module.exports = { registerPersonalizationExports };
