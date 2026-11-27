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
      en: 'Resume Studio, Video Library (4 interview masterclasses), and Luxury PDF templates.',
      fr: 'Studio CV, bibliothèque vidéo (4 masterclass entretien) et modèles PDF premium.',
      es: 'Estudio de CV, biblioteca de videos (4 masterclass) y plantillas PDF premium.',
    },
    badge: null,
    highlighted: false,
    features: {
      en: [
        'Resume Studio — structured resume draft',
        'Video Library — 4 interview masterclasses',
        'Up to 5 video downloads',
        'Luxury PDF templates & career guides',
        'EN / FR / ES delivery',
      ],
      fr: [
        'Studio CV — brouillon de CV structuré',
        'Bibliothèque vidéo — 4 masterclass entretien',
        "Jusqu'à 5 téléchargements vidéo",
        'Modèles PDF premium et guides carrière',
        'Livraison EN / FR / ES',
      ],
      es: [
        'Estudio de CV — borrador de CV estructurado',
        'Biblioteca de videos — 4 masterclass de entrevista',
        'Hasta 5 descargas de video',
        'Plantillas PDF premium y guías de carrera',
        'Entrega EN / FR / ES',
      ],
    },
    servicesBreakdown: {
      en: [
        {
          title: 'Resume Studio',
          detail: 'Upload or paste your resume to get a structured draft.',
        },
        { title: 'Video Library', detail: '4 interview-series masterclasses in EN / FR / ES.' },
        { title: 'Downloads', detail: 'Up to 5 video downloads.' },
        { title: 'Luxury PDFs', detail: 'Premium templates and career guides.' },
      ],
      fr: [
        {
          title: 'Studio CV',
          detail: 'Téléversez ou collez votre CV pour obtenir un brouillon structuré.',
        },
        { title: 'Bibliothèque vidéo', detail: '4 masterclass entretien en EN / FR / ES.' },
        { title: 'Téléchargements', detail: "Jusqu'à 5 téléchargements vidéo." },
        { title: 'PDF premium', detail: 'Modèles premium et guides carrière.' },
      ],
      es: [
        {
          title: 'Estudio de CV',
          detail: 'Sube o pega tu CV para obtener un borrador estructurado.',
        },
        { title: 'Biblioteca de videos', detail: '4 masterclass de entrevista en EN / FR / ES.' },
        { title: 'Descargas', detail: 'Hasta 5 descargas de video.' },
        { title: 'PDF premium', detail: 'Plantillas premium y guías de carrera.' },
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
      en: 'Resume Studio, Video Library (4 interview masterclasses), and Luxury PDF templates.',
      fr: 'Studio CV, bibliothèque vidéo (4 masterclass entretien) et modèles PDF premium.',
      es: 'Estudio de CV, biblioteca de videos (4 masterclass) y plantillas PDF premium.',
    },
    badge: { en: 'Most Popular', fr: 'Le plus populaire', es: 'Más popular' },
    highlighted: true,
    features: {
      en: [
        'Resume Studio — structured resume draft',
        'Video Library — 4 interview masterclasses',
        'Up to 5 video downloads',
        'Luxury PDF templates & career guides',
        'EN / FR / ES delivery',
      ],
      fr: [
        'Studio CV — brouillon de CV structuré',
        'Bibliothèque vidéo — 4 masterclass entretien',
        "Jusqu'à 5 téléchargements vidéo",
        'Modèles PDF premium et guides carrière',
        'Livraison EN / FR / ES',
      ],
      es: [
        'Estudio de CV — borrador de CV estructurado',
        'Biblioteca de videos — 4 masterclass de entrevista',
        'Hasta 5 descargas de video',
        'Plantillas PDF premium y guías de carrera',
        'Entrega EN / FR / ES',
      ],
    },
    servicesBreakdown: {
      en: [
        {
          title: 'Resume Studio',
          detail: 'Upload or paste your resume to get a structured draft.',
        },
        { title: 'Video Library', detail: '4 interview-series masterclasses in EN / FR / ES.' },
        { title: 'Downloads', detail: 'Up to 5 video downloads.' },
        { title: 'Luxury PDFs', detail: 'Premium templates and career guides.' },
      ],
      fr: [
        {
          title: 'Studio CV',
          detail: 'Téléversez ou collez votre CV pour obtenir un brouillon structuré.',
        },
        { title: 'Bibliothèque vidéo', detail: '4 masterclass entretien en EN / FR / ES.' },
        { title: 'Téléchargements', detail: "Jusqu'à 5 téléchargements vidéo." },
        { title: 'PDF premium', detail: 'Modèles premium et guides carrière.' },
      ],
      es: [
        {
          title: 'Estudio de CV',
          detail: 'Sube o pega tu CV para obtener un borrador estructurado.',
        },
        { title: 'Biblioteca de videos', detail: '4 masterclass de entrevista en EN / FR / ES.' },
        { title: 'Descargas', detail: 'Hasta 5 descargas de video.' },
        { title: 'PDF premium', detail: 'Plantillas premium y guías de carrera.' },
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
      en: 'Resume Studio, Video Library (4 interview masterclasses), and Luxury PDF templates.',
      fr: 'Studio CV, bibliothèque vidéo (4 masterclass entretien) et modèles PDF premium.',
      es: 'Estudio de CV, biblioteca de videos (4 masterclass) y plantillas PDF premium.',
    },
    badge: null,
    highlighted: false,
    features: {
      en: [
        'Resume Studio — structured resume draft',
        'Video Library — 4 interview masterclasses',
        'Up to 5 video downloads',
        'Luxury PDF templates & career guides',
        'EN / FR / ES delivery',
      ],
      fr: [
        'Studio CV — brouillon de CV structuré',
        'Bibliothèque vidéo — 4 masterclass entretien',
        "Jusqu'à 5 téléchargements vidéo",
        'Modèles PDF premium et guides carrière',
        'Livraison EN / FR / ES',
      ],
      es: [
        'Estudio de CV — borrador de CV estructurado',
        'Biblioteca de videos — 4 masterclass de entrevista',
        'Hasta 5 descargas de video',
        'Plantillas PDF premium y guías de carrera',
        'Entrega EN / FR / ES',
      ],
    },
    servicesBreakdown: {
      en: [
        {
          title: 'Resume Studio',
          detail: 'Upload or paste your resume to get a structured draft.',
        },
        { title: 'Video Library', detail: '4 interview-series masterclasses in EN / FR / ES.' },
        { title: 'Downloads', detail: 'Up to 5 video downloads.' },
        { title: 'Luxury PDFs', detail: 'Premium templates and career guides.' },
      ],
      fr: [
        {
          title: 'Studio CV',
          detail: 'Téléversez ou collez votre CV pour obtenir un brouillon structuré.',
        },
        { title: 'Bibliothèque vidéo', detail: '4 masterclass entretien en EN / FR / ES.' },
        { title: 'Téléchargements', detail: "Jusqu'à 5 téléchargements vidéo." },
        { title: 'PDF premium', detail: 'Modèles premium et guides carrière.' },
      ],
      es: [
        {
          title: 'Estudio de CV',
          detail: 'Sube o pega tu CV para obtener un borrador estructurado.',
        },
        { title: 'Biblioteca de videos', detail: '4 masterclass de entrevista en EN / FR / ES.' },
        { title: 'Descargas', detail: 'Hasta 5 descargas de video.' },
        { title: 'PDF premium', detail: 'Plantillas premium y guías de carrera.' },
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
      en: 'Cinematic 3D AI avatar interviews (EN/FR/ES), role-play simulations, and a downloadable tip library.',
      fr: 'Entretiens avatar IA 3D cinématiques (EN/FR/ES), simulations de mise en situation et bibliothèque téléchargeable.',
      es: 'Entrevistas avatar IA 3D cinematográficas (EN/FR/ES), simulaciones de rol y biblioteca de consejos descargable.',
    },
    badge: { en: 'Videos & tips', fr: 'Vidéos & conseils', es: 'Videos y consejos' },
    comingSoon: { en: 'Coming Soon', fr: 'Bientôt disponible', es: 'Próximamente' },
    highlighted: false,
    features: {
      en: [
        'Cinematic 3D AI avatar interviews (EN/FR/ES)',
        'Interactive role-play simulations',
        'Downloadable tip library',
        '5-video library access',
        'Covers 8 common jobs',
        'One-time payment',
      ],
      fr: [
        'Entretiens avatar IA 3D cinématiques (EN/FR/ES)',
        'Simulations interactives de mise en situation',
        'Bibliothèque de conseils téléchargeable',
        'Accès bibliothèque (5 téléchargements)',
        'Couvre 8 métiers courants',
        'Paiement unique',
      ],
      es: [
        'Entrevistas avatar IA 3D cinematográficas (EN/FR/ES)',
        'Simulaciones interactivas de rol',
        'Biblioteca de consejos descargable',
        'Acceso a biblioteca (5 descargas)',
        'Cubre 8 empleos comunes',
        'Pago único',
      ],
    },
    servicesBreakdown: {
      en: [
        {
          title: '3D avatar interviews',
          detail: 'Cinematic 3D AI avatar interview training in EN / FR / ES.',
        },
        { title: 'Simulations', detail: 'Interactive role-play paths covering 8 common jobs.' },
        { title: 'Tip library', detail: 'Downloadable tip library with MP4 downloads.' },
        { title: 'Library access', detail: 'Up to 5 video downloads from the Video Library.' },
      ],
      fr: [
        {
          title: 'Entretiens 3D',
          detail: 'Formation entretien avatar IA 3D cinématique en EN / FR / ES.',
        },
        { title: 'Simulations', detail: 'Parcours interactifs couvrant 8 métiers courants.' },
        { title: 'Conseils', detail: 'Bibliothèque téléchargeable avec MP4.' },
        { title: 'Accès', detail: 'Jusqu’à 5 téléchargements dans la bibliothèque vidéo.' },
      ],
      es: [
        {
          title: 'Entrevistas 3D',
          detail: 'Formación de entrevistas avatar IA 3D cinematográfica en EN / FR / ES.',
        },
        { title: 'Simulaciones', detail: 'Rutas interactivas que cubren 8 empleos comunes.' },
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
