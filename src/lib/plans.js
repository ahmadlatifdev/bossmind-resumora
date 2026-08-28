/**
 * Resumora service plan catalog — Basic / Pro / Business / Enterprise.
 * Multilingual: EN / FR / ES.
 *
 * Stripe: one-time (lifetime) Price IDs + Payment Links verified against
 * unit_amount (2900 / 4900 / 7900 / 11000). Env overrides win when they are
 * valid price_… IDs (dollar-label placeholders are ignored).
 */

export const PLAN_IDS = Object.freeze(['basic', 'balanced', 'professional', 'advanced']);

/** Billing: all Resumora plans are lifetime / one-time (never monthly). */
export const PLAN_BILLING = Object.freeze({
  interval: 'once',
  type: 'one_time',
  checkoutMode: 'payment',
});

/** Verified Stripe Price IDs (fallback) — amount-matched to UI labels. Prefer Live env. */
export const CANONICAL_STRIPE_PRICE_IDS = Object.freeze({
  basic: 'price_1U4D7wGjsXTaeZBgdrQVEE0M', // $29
  balanced: 'price_1TYBCSGjsXTaeZBgt9c9wB02', // $49
  professional: 'price_1TxeAPGjsXTaeZBgsSoy8CBJ', // $79
  advanced: 'price_1TYBCQGjsXTaeZBg2q8BLeGv', // $110
});

/** UI aliases only — never send these to Stripe Checkout. */
export const PRICE_ALIASES = Object.freeze({
  price_29: 'basic',
  price_49: 'balanced',
  price_79: 'professional',
  price_110: 'advanced',
});

/** Verified Payment Links matching the same amounts (fallback if Checkout API is blocked). */
export const CANONICAL_STRIPE_PAYMENT_LINKS = Object.freeze({
  basic: 'https://buy.stripe.com/test_28E3cv5XL9BFf1j0Ja0Fi0c',
  balanced: 'https://buy.stripe.com/test_28E7sLbi5aFJ6uNbnO0Fi01',
  professional: 'https://buy.stripe.com/test_cNiaEXeuh5lp8CVcrS0Fi08',
  advanced: 'https://buy.stripe.com/test_3cIeVd99XaFJ4mFeA00Fi00',
});

export const SERVICE_PLANS = Object.freeze([
  {
    id: 'basic',
    name: { en: 'Basic', fr: 'Basic', es: 'Básico' },
    priceLabel: '$29',
    priceCents: 2900,
    billing: PLAN_BILLING,
    stripePriceId: CANONICAL_STRIPE_PRICE_IDS.basic,
    stripePaymentLink: CANONICAL_STRIPE_PAYMENT_LINKS.basic,
    intervalLabel: { en: 'One-time', fr: 'Paiement unique', es: 'Pago único' },
    blurb: {
      en: 'Smart suggestions, 4 standard templates, and 1 included automated edit.',
      fr: 'Suggestions intelligentes, 4 modèles standard et 1 modification automatisée incluse.',
      es: 'Sugerencias inteligentes, 4 plantillas estándar y 1 edición automatizada incluida.',
    },
    badge: null,
    highlighted: false,
    features: {
      en: [
        'Smart suggestions',
        '4 standard templates',
        '1 automated edit',
        'EN / FR / ES delivery',
        'Downloadable deliverables',
      ],
      fr: [
        'Suggestions intelligentes',
        '4 modèles standard',
        '1 modification automatisée',
        'Livraison EN / FR / ES',
        'Livrables téléchargeables',
      ],
      es: [
        'Sugerencias inteligentes',
        '4 plantillas estándar',
        '1 edición automatizada',
        'Entrega EN / FR / ES',
        'Entregables descargables',
      ],
    },
    servicesBreakdown: {
      en: [
        {
          title: 'Smart suggestions',
          detail: 'Keyword and phrasing recommendations for your role.',
        },
        { title: 'Templates', detail: '4 ATS-safe standard layouts.' },
        { title: 'Edits', detail: '1 automated revision when you request changes.' },
        { title: 'Delivery', detail: 'EN / FR / ES + downloadable deliverables — one-time $29.' },
      ],
      fr: [
        {
          title: 'Suggestions intelligentes',
          detail: 'Recommandations de mots-clés et formulations pour votre poste.',
        },
        { title: 'Modèles', detail: '4 mises en page ATS standard.' },
        { title: 'Modifications', detail: '1 révision automatisée lorsque vous la demandez.' },
        { title: 'Livraison', detail: 'EN / FR / ES + livrables téléchargeables — 29 $ unique.' },
      ],
      es: [
        {
          title: 'Sugerencias inteligentes',
          detail: 'Recomendaciones de palabras clave y redacción para su puesto.',
        },
        { title: 'Plantillas', detail: '4 diseños estándar compatibles con ATS.' },
        { title: 'Ediciones', detail: '1 revisión automatizada cuando la solicite.' },
        { title: 'Entrega', detail: 'EN / FR / ES + entregables descargables — pago único $29.' },
      ],
    },
    cta: { en: 'Choose Basic', fr: 'Choisir Basic', es: 'Elegir Básico' },
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
    billing: PLAN_BILLING,
    stripePriceId: CANONICAL_STRIPE_PRICE_IDS.balanced,
    stripePaymentLink: CANONICAL_STRIPE_PAYMENT_LINKS.balanced,
    intervalLabel: { en: 'One-time', fr: 'Paiement unique', es: 'Pago único' },
    blurb: {
      en: 'One resume (1–2 pages), cover letter, advanced ATS, and 2 included edits.',
      fr: 'Un CV (1–2 pages), lettre de motivation, ATS avancé et 2 modifications incluses.',
      es: 'Un CV (1–2 páginas), carta de presentación, ATS avanzado y 2 ediciones incluidas.',
    },
    badge: { en: 'Most selected', fr: 'Le plus choisi', es: 'Más elegido' },
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
    cta: { en: 'Choose Pro', fr: 'Choisir Pro', es: 'Elegir Pro' },
    envPriceKeys: [
      'VITE_STRIPE_PRICE_BALANCED',
      'NEXT_PUBLIC_STRIPE_PRICE_PRO',
      'VITE_STRIPE_PRICE_PRO',
      'STRIPE_PRICE_BALANCED',
      'STRIPE_RESUMORA_BALANCED_PRICE_ID',
    ],
  },
  {
    id: 'professional',
    name: { en: 'Business', fr: 'Business', es: 'Business' },
    priceLabel: '$79',
    priceCents: 7900,
    billing: PLAN_BILLING,
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
    cta: { en: 'Choose Business', fr: 'Choisir Business', es: 'Elegir Business' },
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
    name: { en: 'Enterprise', fr: 'Enterprise', es: 'Enterprise' },
    priceLabel: '$110',
    priceCents: 11000,
    billing: PLAN_BILLING,
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
    cta: { en: 'Choose Enterprise', fr: 'Choisir Enterprise', es: 'Elegir Enterprise' },
    envPriceKeys: [
      'VITE_STRIPE_PRICE_ADVANCED',
      'NEXT_PUBLIC_STRIPE_PRICE_ESSENTIAL_ADVANCED',
      'STRIPE_PRICE_ADVANCED',
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

/** First env value that looks like a Stripe Price ID (ignores "$29"-style placeholders). */
function firstPriceEnv(keys) {
  for (const key of keys) {
    const value = String(import.meta.env[key] || '').trim();
    if (/^price_/.test(value)) return value;
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
  // Live cutover: env Price IDs win when set (must start with price_).
  const fromEnv = firstPriceEnv(plan.envPriceKeys || []);
  if (fromEnv) return fromEnv;
  return plan.stripePriceId || CANONICAL_STRIPE_PRICE_IDS[planId] || '';
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
