/**
 * Resumora service plan catalog — Basic / Pro / Business / Enterprise.
 * Multilingual: EN / FR / ES.
 *
 * Stripe: each plan has a canonical Price ID + Payment Link verified against
 * unit_amount (2900 / 4900 / 7900 / 11000). Env overrides are allowed only when
 * they resolve to the same amount on the server.
 */

export const PLAN_IDS = Object.freeze(['basic', 'balanced', 'professional', 'advanced']);

/** Verified Stripe Price IDs (live mode) — amount-matched to UI labels. */
export const CANONICAL_STRIPE_PRICE_IDS = Object.freeze({
  basic: 'price_1UWzcnKDmqaZUHNogqJyfWrH', // $29
  balanced: 'price_1UWzcoKDmqaZUHNo9rXhTedQ', // $49
  professional: 'price_1UWzcpKDmqaZUHNov1LULtQi', // $79
  advanced: 'price_1UWzcpKDmqaZUHNoVE1Jm46M', // $110
});

/** UI aliases only — never send these to Stripe Checkout. */
export const PRICE_ALIASES = Object.freeze({
  price_29: 'basic',
  price_49: 'balanced',
  price_79: 'professional',
  price_110: 'advanced',
});

/** Verified Live Payment Links matching the same amounts (fallback if Checkout API is blocked). */
export const CANONICAL_STRIPE_PAYMENT_LINKS = Object.freeze({
  basic: 'https://buy.stripe.com/8x2bJ2flT6ihaVM2aMg7e01',
  balanced: 'https://buy.stripe.com/5kQeVegpXeON4xo9Deg7e02',
  professional: 'https://buy.stripe.com/7sY28sgpXgWV2pg3eQg7e03',
  advanced: 'https://buy.stripe.com/14AbJ27TreONe7Y5mYg7e04',
});

export const SERVICE_PLANS = Object.freeze([
  {
    id: 'basic',
    name: { en: 'Basic', fr: 'Basic', es: 'Básico' },
    priceLabel: '$29',
    priceCents: 2900,
    stripePriceId: CANONICAL_STRIPE_PRICE_IDS.basic,
    stripePaymentLink: CANONICAL_STRIPE_PAYMENT_LINKS.basic,
    intervalLabel: { en: 'One-time', fr: 'Paiement unique', es: 'Pago único' },
    blurb: {
      en: 'AI suggestions, 4 standard templates, and 1 included automated edit.',
      fr: 'Suggestions IA, 4 modèles standard et 1 modification automatisée incluse.',
      es: 'Sugerencias IA, 4 plantillas estándar y 1 edición automatizada incluida.',
    },
    badge: null,
    highlighted: false,
    features: {
      en: [
        'AI suggestions',
        '4 standard templates',
        '1 automated edit',
        'EN / FR / ES delivery',
        'Downloadable deliverables',
      ],
      fr: [
        'Suggestions IA',
        '4 modèles standard',
        '1 modification automatisée',
        'Livraison EN / FR / ES',
        'Livrables téléchargeables',
      ],
      es: [
        'Sugerencias IA',
        '4 plantillas estándar',
        '1 edición automatizada',
        'Entrega EN / FR / ES',
        'Entregables descargables',
      ],
    },
    servicesBreakdown: {
      en: [
        { title: 'AI suggestions', detail: 'Keyword and phrasing recommendations for your role.' },
        { title: 'Templates', detail: '4 ATS-safe standard layouts.' },
        { title: 'Edits', detail: '1 automated revision when you request changes.' },
        { title: 'Delivery', detail: 'EN / FR / ES + downloadable deliverables — one-time $29.' },
      ],
      fr: [
        {
          title: 'Suggestions IA',
          detail: 'Recommandations de mots-clés et formulations pour votre poste.',
        },
        { title: 'Modèles', detail: '4 mises en page ATS standard.' },
        { title: 'Modifications', detail: '1 révision automatisée lorsque vous la demandez.' },
        { title: 'Livraison', detail: 'EN / FR / ES + livrables téléchargeables — 29 $ unique.' },
      ],
      es: [
        {
          title: 'Sugerencias IA',
          detail: 'Recomendaciones de palabras clave y redacción para su puesto.',
        },
        { title: 'Plantillas', detail: '4 diseños estándar compatibles con ATS.' },
        { title: 'Ediciones', detail: '1 revisión automatizada cuando la solicite.' },
        { title: 'Entrega', detail: 'EN / FR / ES + entregables descargables — pago único $29.' },
      ],
    },
    cta: { en: 'Start Building', fr: 'Commencer maintenant', es: 'Empezar ahora' },
    envPriceKeys: [
      'VITE_STRIPE_PRICE_BASIC',
      'NEXT_PUBLIC_STRIPE_PRICE_BASIC',
      'STRIPE_RESUMORA_BASIC_PRICE_ID',
      'STRIPE_PRICE_BASIC',
    ],
  },
  {
    id: 'balanced',
    name: { en: 'Pro', fr: 'Pro', es: 'Pro' },
    priceLabel: '$49',
    priceCents: 4900,
    stripePriceId: CANONICAL_STRIPE_PRICE_IDS.balanced,
    stripePaymentLink: CANONICAL_STRIPE_PAYMENT_LINKS.balanced,
    intervalLabel: { en: 'One-time', fr: 'Paiement unique', es: 'Pago único' },
    blurb: {
      en: 'One resume (1–2 pages), cover letter, advanced ATS, and 2 included edits.',
      fr: 'Un CV (1–2 pages), lettre de motivation, ATS avancé et 2 modifications incluses.',
      es: 'Un CV (1–2 páginas), carta de presentación, ATS avanzado y 2 ediciones incluidas.',
    },
    badge: { en: 'Most Popular', fr: 'Le plus populaire', es: 'Más popular' },
    highlighted: true,
    features: {
      en: [
        'One resume (1–2 pages)',
        'Cover letter',
        'Advanced ATS',
        '2 automated edits (on request)',
        'EN / FR / ES delivery',
        'Downloadable deliverables',
      ],
      fr: [
        'Un CV (1–2 pages)',
        'Lettre de motivation',
        'ATS avancé',
        '2 modifications automatisées (sur demande)',
        'Livraison EN / FR / ES',
        'Livrables téléchargeables',
      ],
      es: [
        'Un CV (1–2 páginas)',
        'Carta de presentación',
        'ATS avanzado',
        '2 ediciones automatizadas (a solicitud)',
        'Entrega EN / FR / ES',
        'Entregables descargables',
      ],
    },
    servicesBreakdown: {
      en: [
        { title: 'Resume', detail: 'One professional resume — choose 1 or 2 pages.' },
        { title: 'Cover letter', detail: 'Matched tone and keywords for your target role.' },
        { title: 'ATS', detail: 'Advanced parsing-safe structure and keyword alignment.' },
        { title: 'Edits', detail: '2 automated revisions when you request them.' },
      ],
      fr: [
        { title: 'CV', detail: 'Un CV professionnel — 1 ou 2 pages au choix.' },
        { title: 'Lettre', detail: 'Ton et mots-clés adaptés à votre poste cible.' },
        { title: 'ATS', detail: 'Structure compatible parseurs et alignement lexical.' },
        { title: 'Modifications', detail: '2 révisions automatisées sur demande.' },
      ],
      es: [
        { title: 'CV', detail: 'Un CV profesional — elija 1 o 2 páginas.' },
        { title: 'Carta', detail: 'Tono y palabras clave alineados a su puesto objetivo.' },
        { title: 'ATS', detail: 'Estructura segura para parsers y alineación léxica.' },
        { title: 'Ediciones', detail: '2 revisiones automatizadas cuando las solicite.' },
      ],
    },
    cta: { en: 'Get Hired Faster', fr: 'Décrochez un entretien', es: 'Consiga una entrevista' },
    envPriceKeys: [
      'VITE_STRIPE_PRICE_BALANCED',
      'STRIPE_PRICE_BALANCED',
      'STRIPE_RESUMORA_BALANCED_PRICE_ID',
    ],
  },
  {
    id: 'professional',
    name: { en: 'Business', fr: 'Business', es: 'Negocio' },
    priceLabel: '$79',
    priceCents: 7900,
    stripePriceId: CANONICAL_STRIPE_PRICE_IDS.professional,
    stripePaymentLink: CANONICAL_STRIPE_PAYMENT_LINKS.professional,
    intervalLabel: { en: 'One-time', fr: 'Paiement unique', es: 'Pago único' },
    blurb: {
      en: 'Resume + cover letter, LinkedIn sync, interview prep, and 3 included edits.',
      fr: "CV + lettre, sync LinkedIn, préparation d'entretien et 3 modifications incluses.",
      es: 'CV + carta, sincronización LinkedIn, prep. de entrevista y 3 ediciones incluidas.',
    },
    badge: null,
    highlighted: false,
    features: {
      en: [
        'One resume (1–2 pages)',
        'Cover letter',
        'LinkedIn sync',
        'Interview prep',
        '3 automated edits (on request)',
        'Downloadable deliverables',
      ],
      fr: [
        'Un CV (1–2 pages)',
        'Lettre de motivation',
        'Synchronisation LinkedIn',
        "Préparation d'entretien",
        '3 modifications automatisées (sur demande)',
        'Livrables téléchargeables',
      ],
      es: [
        'Un CV (1–2 páginas)',
        'Carta de presentación',
        'Sincronización LinkedIn',
        'Preparación de entrevista',
        '3 ediciones automatizadas (a solicitud)',
        'Entregables descargables',
      ],
    },
    servicesBreakdown: {
      en: [
        { title: 'Resume + letter', detail: 'Full package with 1–2 page resume options.' },
        { title: 'LinkedIn sync', detail: 'Headline, about, and experience alignment.' },
        { title: 'Interview prep', detail: 'Role-focused Q&A coaching prompts.' },
        { title: 'Edits', detail: '3 automated revisions when you request them.' },
      ],
      fr: [
        { title: 'CV + lettre', detail: 'Forfait complet avec option 1–2 pages.' },
        { title: 'LinkedIn', detail: 'Alignement titre, à propos et expériences.' },
        { title: 'Entretien', detail: 'Questions/réponses ciblées sur le poste.' },
        { title: 'Modifications', detail: '3 révisions automatisées sur demande.' },
      ],
      es: [
        { title: 'CV + carta', detail: 'Paquete completo con opción de 1–2 páginas.' },
        { title: 'LinkedIn', detail: 'Alineación de titular, acerca de y experiencia.' },
        { title: 'Entrevista', detail: 'Preguntas y respuestas enfocadas al puesto.' },
        { title: 'Ediciones', detail: '3 revisiones automatizadas cuando las solicite.' },
      ],
    },
    cta: {
      en: 'Upgrade to Business',
      fr: 'Passez à Business',
      es: 'Actualice a Negocio',
    },
    envPriceKeys: [
      'VITE_STRIPE_PRICE_PROFESSIONAL_TIER',
      'STRIPE_PRICE_PROFESSIONAL_TIER',
      'VITE_STRIPE_PRICE_ELITE',
      'NEXT_PUBLIC_STRIPE_PRICE_ELITE',
      'STRIPE_RESUMORA_EXECUTIVE_PRICE_ID',
    ],
  },
  {
    id: 'advanced',
    name: { en: 'Enterprise', fr: 'Enterprise', es: 'Empresa' },
    priceLabel: '$110',
    priceCents: 11000,
    stripePriceId: CANONICAL_STRIPE_PRICE_IDS.advanced,
    stripePaymentLink: CANONICAL_STRIPE_PAYMENT_LINKS.advanced,
    intervalLabel: { en: 'One-time', fr: 'Paiement unique', es: 'Pago único' },
    blurb: {
      en: 'Interview training videos (EN/FR/ES), simulations, and a downloadable tip library.',
      fr: 'Vidéos de formation entretien (EN/FR/ES), simulations et bibliothèque téléchargeable.',
      es: 'Videos de formación (EN/FR/ES), simulaciones y biblioteca de consejos descargable.',
    },
    badge: { en: 'Videos & tips', fr: 'Vidéos & conseils', es: 'Videos y consejos' },
    highlighted: false,
    features: {
      en: [
        'Interview training videos (EN/FR/ES)',
        'Simulations',
        'Downloadable tip library',
        '5-video library access',
        'Covers 8 common jobs',
        'One-time payment',
      ],
      fr: [
        'Vidéos de formation entretien (EN/FR/ES)',
        'Simulations',
        'Bibliothèque de conseils téléchargeable',
        'Accès bibliothèque (5 téléchargements)',
        'Couvre 8 métiers courants',
        'Paiement unique',
      ],
      es: [
        'Videos de formación (EN/FR/ES)',
        'Simulaciones',
        'Biblioteca de consejos descargable',
        'Acceso a biblioteca (5 descargas)',
        'Cubre 8 empleos comunes',
        'Pago único',
      ],
    },
    servicesBreakdown: {
      en: [
        { title: 'Training videos', detail: 'Interview training videos in EN / FR / ES.' },
        { title: 'Simulations', detail: 'Practice paths covering 8 common jobs.' },
        { title: 'Tip library', detail: 'Downloadable tip library with MP4 downloads.' },
        { title: 'Library access', detail: 'Up to 5 video downloads from the Video Library.' },
      ],
      fr: [
        { title: 'Vidéos', detail: 'Formation entretien en EN / FR / ES.' },
        { title: 'Simulations', detail: 'Parcours couvrant 8 métiers courants.' },
        { title: 'Conseils', detail: 'Bibliothèque téléchargeable avec MP4.' },
        { title: 'Accès', detail: 'Jusqu’à 5 téléchargements dans la bibliothèque vidéo.' },
      ],
      es: [
        { title: 'Videos', detail: 'Formación de entrevistas en EN / FR / ES.' },
        { title: 'Simulaciones', detail: 'Rutas que cubren 8 empleos comunes.' },
        { title: 'Consejos', detail: 'Biblioteca descargable con MP4.' },
        { title: 'Acceso', detail: 'Hasta 5 descargas en la biblioteca de videos.' },
      ],
    },
    cta: { en: 'Get Enterprise', fr: 'Obtenir Enterprise', es: 'Obtener Empresa' },
    envPriceKeys: [
      'VITE_STRIPE_PRICE_ADVANCED',
      'NEXT_PUBLIC_STRIPE_PRICE_ESSENTIAL_ADVANCED',
      'STRIPE_RESUMORA_ESSENTIAL_ADVANCED_PRICE_ID',
    ],
  },
]);

function firstEnv(keys) {
  for (const key of keys) {
    const value = import.meta.env[key];
    if (value && String(value).trim()) return String(value).trim();
  }
  return '';
}

export function localize(field, lang = 'en') {
  if (field == null) return '';
  if (typeof field === 'string') return field;
  if (Array.isArray(field)) return field;
  return field[lang] || field.en || '';
}

export function getStripePriceIdForPlan(planId) {
  const plan = SERVICE_PLANS.find((p) => p.id === planId);
  if (!plan) return '';
  // Prefer canonical verified Price ID so UI $29/$49/$79/$110 always match Checkout.
  // Env overrides are intentionally ignored here when they historically pointed at wrong amounts.
  return plan.stripePriceId || CANONICAL_STRIPE_PRICE_IDS[planId] || firstEnv(plan.envPriceKeys);
}

export function getStripePaymentLinkForPlan(planId) {
  const plan = SERVICE_PLANS.find((p) => p.id === planId);
  if (!plan) return '';
  // Exact plan links only — no cross-alias (e.g. balanced → old "professional" link).
  const envMap = {
    basic: ['VITE_STRIPE_PAYMENT_LINK_BASIC'],
    balanced: ['VITE_STRIPE_PAYMENT_LINK_BALANCED'],
    professional: ['VITE_STRIPE_PAYMENT_LINK_PROFESSIONAL_TIER', 'VITE_STRIPE_PAYMENT_LINK_ELITE'],
    advanced: ['VITE_STRIPE_PAYMENT_LINK_ADVANCED'],
  };
  return (
    firstEnv(envMap[planId] || []) ||
    plan.stripePaymentLink ||
    CANONICAL_STRIPE_PAYMENT_LINKS[planId] ||
    ''
  );
}

export function getExpectedCentsForPlan(planId) {
  const plan = SERVICE_PLANS.find((p) => p.id === planId);
  return plan ? plan.priceCents : 0;
}

export function getStripePublishableKey() {
  const raw = firstEnv(['VITE_STRIPE_PUBLISHABLE_KEY', 'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY']);
  // Guard against corrupted env values where another secret was concatenated onto the PK.
  const match = String(raw || '').match(/^(pk_(?:test|live)_[A-Za-z0-9]+)/);
  return match ? match[1] : '';
}

export function isStripeTestMode() {
  return getStripePublishableKey().startsWith('pk_test_');
}

export function getPlanById(planId) {
  if (!planId) return null;
  const alias = PRICE_ALIASES[planId];
  if (alias) return SERVICE_PLANS.find((p) => p.id === alias) || null;
  return (
    SERVICE_PLANS.find((p) => p.id === planId) ||
    SERVICE_PLANS.find((p) => p.stripePriceId === planId) ||
    null
  );
}

export function rememberSelectedPlan(planId) {
  try {
    localStorage.setItem('resumora_selected_plan', planId);
  } catch (_) {
    /* ignore */
  }
}

export function readSelectedPlan() {
  try {
    return localStorage.getItem('resumora_selected_plan') || '';
  } catch (_) {
    return '';
  }
}
