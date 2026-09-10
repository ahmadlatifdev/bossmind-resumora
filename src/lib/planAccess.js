/**
 * Client-side video access helpers (mirrors functions/lib/planAccess.js).
 * access_level: free | paid | enterprise
 * Plans: free < basic/balanced < professional < advanced
 */

const RANK = {
  free: 0,
  basic: 1,
  balanced: 2,
  professional: 3,
  advanced: 4,
  pro: 3,
  enterprise: 4,
};

export function planRank(planId) {
  const key = String(planId || 'free')
    .trim()
    .toLowerCase();
  return RANK[key] ?? 0;
}

export function canAccessVideo(userPlanId, accessLevel = 'free') {
  const level = String(accessLevel || 'free')
    .trim()
    .toLowerCase();
  let required = 0;
  if (level === 'enterprise' || level === 'advanced') required = RANK.advanced;
  else if (level === 'paid' || level === 'pro' || level === 'professional') required = RANK.basic;
  return planRank(userPlanId) >= required;
}

export function filterVideosForPlan(videos, userPlanId) {
  return (videos || []).filter((v) =>
    canAccessVideo(userPlanId, v.access_level || v.accessLevel || 'free')
  );
}
