/**
 * Zero-touch auto-ACK for System Health approvals.
 * Enabled when SELF_HEAL_ALLOW_GCLOUD=true or SELF_HEAL_ALLOW_AUTO_ACK=true.
 * Approving only authorizes the ops runbook — secrets are never rewritten here.
 */
'use strict';

function isAutoAckEnabled() {
  const v = String(
    process.env.SELF_HEAL_ALLOW_GCLOUD || process.env.SELF_HEAL_ALLOW_AUTO_ACK || ''
  ).toLowerCase();
  return v === 'true' || v === '1' || v === 'yes';
}

/** High-confidence heal action ids that may be auto-authorized (no secret mutation). */
const HIGH_CONFIDENCE_ACTIONS = new Set([
  'warmup_endpoints',
  'record_only',
  'first_time_warmup_verify',
  'env_rollback_proposal',
  'cloud_run_restart_proposal',
  'cdn_purge_proposal',
  'auto_rollback_proposal',
]);

function isHighConfidenceAction(actionId) {
  return HIGH_CONFIDENCE_ACTIONS.has(String(actionId || ''));
}

module.exports = {
  isAutoAckEnabled,
  isHighConfidenceAction,
  HIGH_CONFIDENCE_ACTIONS,
};
