/**
 * Video content gating by Resumora plan tiers.
 * access_level on video_registry: free | paid | enterprise
 * Plans: free < basic/balanced < professional < advanced(enterprise)
 */
'use strict';

const RANK = {
  free: 0,
  basic: 1,
  balanced: 2,
  professional: 3,
  advanced: 4,
  // aliases
  pro: 3,
  enterprise: 4,
};

function planRank(planId) {
  const key = String(planId || 'free')
    .trim()
    .toLowerCase();
  return RANK[key] ?? 0;
}

function requiredRank(accessLevel) {
  const level = String(accessLevel || 'free')
    .trim()
    .toLowerCase();
  if (level === 'enterprise' || level === 'advanced') return RANK.advanced;
  if (level === 'paid' || level === 'pro' || level === 'professional') return RANK.basic;
  return RANK.free;
}

/**
 * @param {string|null|undefined} userPlanId
 * @param {string|null|undefined} accessLevel
 */
function canAccessVideo(userPlanId, accessLevel) {
  return planRank(userPlanId) >= requiredRank(accessLevel);
}

/**
 * Filter a list of video docs/objects by access_level.
 */
function filterVideosForPlan(videos, userPlanId) {
  return (videos || []).filter((v) =>
    canAccessVideo(userPlanId, v.access_level || v.accessLevel || 'free')
  );
}

module.exports = {
  canAccessVideo,
  filterVideosForPlan,
  planRank,
  requiredRank,
};
