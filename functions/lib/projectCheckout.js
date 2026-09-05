/**
 * Multi-project Checkout resolution (Resumora + optional ElegancyArt).
 * Never logs secret or full price_ values.
 *
 * ElegancyArt requires env (Secret Manager / Cloud Run) before live sessions:
 * - ELEGANCYART_STRIPE_SECRET_KEY (optional; falls back to STRIPE_SECRET_KEY only if prices mapped)
 * - ELEGANCYART_STRIPE_PRICE_<PLAN> for each planId you enable
 * - Optional ELEGANCYART_CHECKOUT_SUCCESS_URL / ELEGANCYART_CHECKOUT_CANCEL_URL
 */
const RESUMORA_PLANS = new Set(['basic', 'balanced', 'professional', 'advanced']);

function normalizeProject(raw) {
  const id = String(raw || 'resumora')
    .toLowerCase()
    .trim();
  if (id === 'elegancy' || id === 'elegancy-art') return 'elegancyart';
  return id || 'resumora';
}

function firstEnv(keys) {
  for (const key of keys) {
    const v = process.env[key];
    if (v && String(v).trim()) return String(v).trim();
  }
  return '';
}

function elegancyPriceEnvKey(planId) {
  const p = String(planId || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_');
  return `ELEGANCYART_STRIPE_PRICE_${p}`;
}

/**
 * @returns {{
 *   projectId: string,
 *   secret: string,
 *   priceId: string,
 *   successUrl: string,
 *   cancelUrl: string,
 *   source: string,
 *   configured: boolean,
 *   error?: string
 * }}
 */
function resolveProjectCheckout({
  project,
  planId,
  bodyPriceId,
  resolveResumoraPriceId,
  defaultSuccessUrl,
  defaultCancelUrl,
  bodySuccessUrl,
  bodyCancelUrl,
}) {
  const projectId = normalizeProject(project);
  const plan = String(planId || '').trim();

  if (projectId === 'resumora') {
    const priceId = resolveResumoraPriceId(plan, bodyPriceId);
    const secret = String(process.env.STRIPE_SECRET_KEY || '').trim();
    if (!secret) {
      return {
        projectId,
        secret: '',
        priceId: '',
        successUrl: '',
        cancelUrl: '',
        source: 'resumora.net',
        configured: false,
        error: 'STRIPE_SECRET_KEY is not configured on the server.',
      };
    }
    if (!priceId) {
      return {
        projectId,
        secret,
        priceId: '',
        successUrl: '',
        cancelUrl: '',
        source: 'resumora.net',
        configured: false,
        error: `No Stripe Price ID mapped for plan "${plan}".`,
      };
    }
    return {
      projectId,
      secret,
      priceId,
      successUrl: bodySuccessUrl || defaultSuccessUrl,
      cancelUrl: bodyCancelUrl || defaultCancelUrl,
      source: 'resumora.net',
      configured: true,
    };
  }

  if (projectId === 'elegancyart') {
    const secret = firstEnv(['ELEGANCYART_STRIPE_SECRET_KEY', 'STRIPE_SECRET_KEY']);
    const priceFromEnv = firstEnv([elegancyPriceEnvKey(plan), `ELEGANCYART_PRICE_${plan}`]);
    const priceId =
      bodyPriceId && /^price_/.test(String(bodyPriceId))
        ? String(bodyPriceId).trim()
        : priceFromEnv;
    const successUrl =
      bodySuccessUrl ||
      firstEnv(['ELEGANCYART_CHECKOUT_SUCCESS_URL']) ||
      'https://resumora.net/admin/master?checkout=elegancy-success';
    const cancelUrl =
      bodyCancelUrl ||
      firstEnv(['ELEGANCYART_CHECKOUT_CANCEL_URL']) ||
      'https://resumora.net/admin/master?checkout=elegancy-canceled';

    if (!secret) {
      return {
        projectId,
        secret: '',
        priceId: '',
        successUrl,
        cancelUrl,
        source: 'elegancyart',
        configured: false,
        error:
          'ElegancyArt Stripe is not configured. Add ELEGANCYART_STRIPE_SECRET_KEY (or shared STRIPE_SECRET_KEY) in Secret Manager.',
      };
    }
    if (!priceId) {
      return {
        projectId,
        secret,
        priceId: '',
        successUrl,
        cancelUrl,
        source: 'elegancyart',
        configured: false,
        error: `ElegancyArt price not mapped for plan "${plan}". Set env ${elegancyPriceEnvKey(plan)} (price_…) then redeploy.`,
      };
    }
    return {
      projectId,
      secret,
      priceId,
      successUrl,
      cancelUrl,
      source: 'elegancyart',
      configured: true,
    };
  }

  return {
    projectId,
    secret: '',
    priceId: '',
    successUrl: '',
    cancelUrl: '',
    source: projectId,
    configured: false,
    error: `Checkout not enabled for project "${projectId}". Supported: resumora, elegancyart.`,
  };
}

function isResumoraPlan(planId) {
  return RESUMORA_PLANS.has(String(planId || '').trim());
}

module.exports = {
  normalizeProject,
  resolveProjectCheckout,
  isResumoraPlan,
  elegancyPriceEnvKey,
};
