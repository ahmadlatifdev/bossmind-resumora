/**
 * BossMind orchestrator catalog — benefits & features per project (read-only).
 * Resumora mirrors its live plan tiers; other projects expose stub tiers until
 * they ship. This is a display/entitlement catalog only — no Stripe mutation.
 */
'use strict';

const RESUME_FEATURES = Object.freeze({
  basic: Object.freeze([
    'AI suggestions',
    '4 standard templates',
    '1 automated edit',
    'EN / FR / ES delivery',
    'Downloadable deliverables',
  ]),
  balanced: Object.freeze([
    'One resume (1–2 pages)',
    'Cover letter',
    'Advanced ATS',
    '2 automated edits (on request)',
    'EN / FR / ES delivery',
    'Downloadable deliverables',
  ]),
  professional: Object.freeze([
    'One resume (1–2 pages)',
    'Cover letter',
    'LinkedIn sync',
    'Interview prep',
    '3 automated edits (on request)',
    'Downloadable deliverables',
  ]),
  advanced: Object.freeze([
    'Interview training videos (EN/FR/ES)',
    'Simulations',
    'Downloadable tip library',
    '5-video library access',
    'Covers 8 common jobs',
    'One-time payment',
  ]),
});

const CATALOG = Object.freeze({
  resumora: Object.freeze({
    id: 'resumora',
    name: 'Resumora',
    tiers: Object.freeze([
      Object.freeze({
        id: 'basic',
        name: 'Basic',
        price: '$29',
        highlighted: false,
        features: RESUME_FEATURES.basic,
      }),
      Object.freeze({
        id: 'balanced',
        name: 'Pro',
        price: '$49',
        highlighted: true,
        features: RESUME_FEATURES.balanced,
      }),
      Object.freeze({
        id: 'professional',
        name: 'Business',
        price: '$79',
        highlighted: false,
        features: RESUME_FEATURES.professional,
      }),
      Object.freeze({
        id: 'advanced',
        name: 'Enterprise',
        price: '$110',
        highlighted: false,
        features: RESUME_FEATURES.advanced,
      }),
    ]),
    featureFlags: Object.freeze([
      Object.freeze({
        key: 'videoLibrary',
        label: 'Premium Interview Series (Video Library)',
        enabled: true,
      }),
      Object.freeze({
        key: 'luxuryPdfs',
        label: 'Luxury PDFs (resume / cover letter / career guides)',
        enabled: true,
      }),
      Object.freeze({
        key: 'aiSuggestions',
        label: 'AI keyword tool + suggestions',
        enabled: true,
      }),
      Object.freeze({ key: 'atsOptimization', label: 'ATS optimization', enabled: true }),
    ]),
  }),
  elegancyart: Object.freeze({
    id: 'elegancyart',
    name: 'ElegancyArt',
    tiers: Object.freeze([
      Object.freeze({
        id: 'basic',
        name: 'Basic',
        price: '—',
        highlighted: false,
        features: Object.freeze(['AI image generation', 'Standard gallery', 'Watermarked exports']),
      }),
      Object.freeze({
        id: 'standard',
        name: 'Standard',
        price: '—',
        highlighted: true,
        features: Object.freeze([
          'AI image generation',
          'HD export',
          'Priority queue',
          'Commercial license',
        ]),
      }),
    ]),
    featureFlags: Object.freeze([
      Object.freeze({ key: 'aiImages', label: 'AI image generation', enabled: true }),
    ]),
  }),
  'ai-video': Object.freeze({
    id: 'ai-video',
    name: 'AI Video Generator',
    tiers: Object.freeze([
      Object.freeze({
        id: 'starter',
        name: 'Starter',
        price: '—',
        highlighted: false,
        features: Object.freeze(['Short-form generation', '720p export']),
      }),
      Object.freeze({
        id: 'pro',
        name: 'Pro',
        price: '—',
        highlighted: true,
        features: Object.freeze(['Long-form generation', '1080p export', 'Voice cloning']),
      }),
    ]),
    featureFlags: Object.freeze([
      Object.freeze({ key: 'veo', label: 'Veo video model', enabled: true }),
    ]),
  }),
  'tiktok-ai': Object.freeze({
    id: 'tiktok-ai',
    name: 'TikTok AI',
    tiers: Object.freeze([
      Object.freeze({
        id: 'starter',
        name: 'Starter',
        price: '—',
        highlighted: false,
        features: Object.freeze(['Auto-captions', 'Trend analysis']),
      }),
      Object.freeze({
        id: 'pro',
        name: 'Pro',
        price: '—',
        highlighted: true,
        features: Object.freeze(['Auto-captions', 'Trend analysis', 'Scheduled publishing']),
      }),
    ]),
    featureFlags: Object.freeze([
      Object.freeze({ key: 'veo', label: 'Veo video model', enabled: true }),
    ]),
  }),
  'global-stock': Object.freeze({
    id: 'global-stock',
    name: 'Global Stock',
    tiers: Object.freeze([
      Object.freeze({
        id: 'basic',
        name: 'Basic',
        price: '—',
        highlighted: false,
        features: Object.freeze(['Daily allocation', 'Portfolio summary']),
      }),
      Object.freeze({
        id: 'pro',
        name: 'Pro',
        price: '—',
        highlighted: true,
        features: Object.freeze(['Daily allocation', 'Portfolio summary', 'Advanced analytics']),
      }),
    ]),
    featureFlags: Object.freeze([
      Object.freeze({ key: 'autoAllocation', label: 'Automated daily allocation', enabled: true }),
    ]),
  }),
  'bossmind-orchestrator': Object.freeze({
    id: 'bossmind-orchestrator',
    name: 'BossMind-Orchestrator',
    tiers: Object.freeze([
      Object.freeze({
        id: 'core',
        name: 'Core',
        price: '—',
        highlighted: true,
        features: Object.freeze([
          'Cross-project health',
          'Master console',
          'Safe Mode orchestration',
        ]),
      }),
    ]),
    featureFlags: Object.freeze([
      Object.freeze({ key: 'broc', label: 'BRoC Mission Control', enabled: true }),
    ]),
  }),
});

function listCatalog() {
  return Object.values(CATALOG).map((p) => ({
    id: p.id,
    name: p.name,
    tiers: p.tiers.map((t) => ({
      id: t.id,
      name: t.name,
      price: t.price,
      highlighted: t.highlighted,
      features: [...t.features],
    })),
    featureFlags: p.featureFlags.map((f) => ({ key: f.key, label: f.label, enabled: f.enabled })),
  }));
}

function getProjectCatalog(projectId) {
  const p = CATALOG[String(projectId || '')];
  if (!p) return null;
  return {
    id: p.id,
    name: p.name,
    tiers: p.tiers.map((t) => ({
      id: t.id,
      name: t.name,
      price: t.price,
      highlighted: t.highlighted,
      features: [...t.features],
    })),
    featureFlags: p.featureFlags.map((f) => ({ key: f.key, label: f.label, enabled: f.enabled })),
  };
}

module.exports = { CATALOG, listCatalog, getProjectCatalog };
