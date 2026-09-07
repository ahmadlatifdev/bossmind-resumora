/**
 * Resolve config from GCP Secret Manager injection (Cloud Run / Functions).
 * Values are already mounted into process.env by Firebase defineSecret —
 * this helper centralizes names and never logs secret values.
 */
'use strict';

const { SECRET_NAMES } = require('./googleOnlyStack');

function resolveSecret(name, fallbacks = []) {
  const keys = [name, ...fallbacks];
  for (const key of keys) {
    const v = String(process.env[key] || '').trim();
    if (v) return v;
  }
  return '';
}

function secretPresent(name, fallbacks = []) {
  return Boolean(resolveSecret(name, fallbacks));
}

function inventorySecretPresence() {
  return {
    STRIPE_SECRET_KEY: secretPresent('STRIPE_SECRET_KEY', ['SECRET_STRIPE', 'STRIPE_API_KEY']),
    STRIPE_WEBHOOK_SECRET: secretPresent('STRIPE_WEBHOOK_SECRET', ['STRIPE_WEBHOOK_SECRET_LIVE']),
    ADMIN_REFUND_PASSWORD: secretPresent('ADMIN_REFUND_PASSWORD', [
      'ADMIN_PASSWORD',
      'SELF_HEAL_ADMIN_PASSWORD',
    ]),
    GEMINI_API_KEY: secretPresent('GEMINI_API_KEY', ['GOOGLE_AI_API_KEY', 'GOOGLE_API_KEY']),
    knownSecretNames: [...SECRET_NAMES],
    note: 'Presence only — values never returned',
  };
}

module.exports = {
  resolveSecret,
  secretPresent,
  inventorySecretPresence,
};
