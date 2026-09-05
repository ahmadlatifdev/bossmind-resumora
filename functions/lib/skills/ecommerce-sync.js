/**
 * Skill: E-commerce-Sync — inventory/pricing analysis guidance.
 * Does NOT create products or Stripe sessions in other BossMind projects
 * (project isolation). ElegancyArt remains catalog-only until its API_URL is set.
 */
function runEcommerceSync({ message, lang, projectId }) {
  const code = String(lang || 'en').slice(0, 2);
  const pid = String(projectId || '').toLowerCase();
  const blocked =
    pid === 'elegancyart'
      ? {
          en: 'ElegancyArt checkout is API-ready via POST /api/create-checkout-session { project:"elegancyart", planId }. Returns 503 until ELEGANCYART_STRIPE_PRICE_<PLAN> (+ optional ELEGANCYART_STRIPE_SECRET_KEY) are set. No silent product create from this chat.',
          fr: 'Checkout ElegancyArt via POST /api/create-checkout-session { project:"elegancyart", planId }. 503 tant que ELEGANCYART_STRIPE_PRICE_<PLAN> n’est pas configuré. Pas de création silencieuse.',
          es: 'Checkout ElegancyArt vía POST /api/create-checkout-session { project:"elegancyart", planId }. 503 hasta configurar ELEGANCYART_STRIPE_PRICE_<PLAN>. Sin creación silenciosa.',
        }
      : {
          en: 'E-commerce-Sync is advisory in this harness. Inventory/pricing analysis only — no silent production writes.',
          fr: 'E-commerce-Sync est consultatif. Analyse stock/prix seulement — pas d’écritures prod silencieuses.',
          es: 'E-commerce-Sync es consultivo. Solo análisis inventario/precio — sin escrituras prod silenciosas.',
        };

  const checklist = {
    en: [
      '1. Confirm source of truth (Firestore collection / Neon table) per project.',
      '2. Diff price vs Stripe Price IDs (never print price_ secrets).',
      '3. Flag low-stock / stale SKUs for human review.',
      '4. Checkout URLs only from that project’s verified createCheckoutSession.',
    ],
    fr: [
      '1. Confirmer la source de vérité par projet.',
      '2. Comparer prix vs Price IDs Stripe (ne jamais imprimer les secrets).',
      '3. Signaler stock bas / SKU périmés.',
      '4. URLs checkout uniquement via createCheckoutSession du projet.',
    ],
    es: [
      '1. Confirmar fuente de verdad por proyecto.',
      '2. Comparar precio vs Price IDs Stripe (nunca imprimir secretos).',
      '3. Marcar stock bajo / SKUs obsoletos.',
      '4. URLs de checkout solo vía createCheckoutSession del proyecto.',
    ],
  };

  return {
    skill: 'ecommerce-sync',
    reply: `${blocked[code] || blocked.en}\n\n${(checklist[code] || checklist.en).join('\n')}\n\nRequest: ${String(message || '').slice(0, 200)}`,
  };
}

module.exports = { runEcommerceSync };
