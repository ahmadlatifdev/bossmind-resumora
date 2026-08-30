/**
 * Client-side FAQ matcher (mirrors functions/lib/supportResponses.js).
 * Used when /api/chat/* is unavailable so paid members still get replies.
 */

export const SUPPORT_EMAIL = 'support@resumora.net';

/** @typedef {{ id: string, keywords: string[], responseKey: string }} FaqEntry */

/** @type {FaqEntry[]} */
export const FAQ_ENTRIES = [
  {
    id: 'refund',
    keywords: ['refund', 'remboursement', 'reembolso', 'money back'],
    responseKey: 'chat.faq.billing.refund',
  },
  {
    id: 'cancel',
    keywords: ['cancel', 'annul', 'résili', 'resili', 'cancelar', 'subscription', 'abonnement'],
    responseKey: 'chat.faq.billing.cancel',
  },
  {
    id: 'payment',
    keywords: ['payment', 'paiement', 'pago', 'billing', 'facture', 'factura', 'invoice', 'charge'],
    responseKey: 'chat.faq.billing.payment',
  },
  {
    id: 'resume',
    keywords: ['resume', 'cv', 'studio', 'cover letter', 'lettre', 'carta', 'document', 'upload'],
    responseKey: 'chat.faq.resume.studio',
  },
  {
    id: 'account',
    keywords: ['account', 'compte', 'cuenta', 'login', 'sign in', 'connexion', 'profile'],
    responseKey: 'chat.faq.account.general',
  },
  {
    id: 'password',
    keywords: ['password', 'mot de passe', 'contraseña', 'forgot', 'oublié', 'olvid'],
    responseKey: 'chat.faq.account.password',
  },
  {
    id: 'privacy',
    keywords: ['privacy', 'confidential', 'données', 'datos', 'gdpr', 'rgpd'],
    responseKey: 'chat.faq.privacy',
  },
  {
    id: 'technical',
    keywords: [
      'technical',
      'bug',
      'error',
      'broken',
      'crash',
      'video',
      'vidéo',
      'library',
      'download',
    ],
    responseKey: 'chat.faq.technical',
  },
  {
    id: 'human',
    keywords: [
      'human',
      'specialist',
      'agent',
      'humain',
      'conseiller',
      'humano',
      'talk to',
      'parler',
      'hablar',
    ],
    responseKey: 'chat.faq.human',
  },
];

const FALLBACK_KEY = 'chat.faq.fallback';

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/**
 * @param {string} message
 * @param {string} [intentHint]
 */
export function matchFaq(message, intentHint) {
  const hint = String(intentHint || '')
    .toLowerCase()
    .trim();
  if (hint) {
    const byId = FAQ_ENTRIES.find((e) => e.id === hint);
    if (byId) return byId;
  }

  const hay = normalizeText(message);
  let best = null;
  let bestHits = 0;
  for (const entry of FAQ_ENTRIES) {
    let hits = 0;
    for (const w of entry.keywords) {
      const needle = normalizeText(w);
      if (needle && hay.includes(needle)) hits += 1;
    }
    if (hits > bestHits) {
      bestHits = hits;
      best = entry;
    }
  }
  return bestHits > 0 ? best : { id: 'fallback', keywords: [], responseKey: FALLBACK_KEY };
}

/**
 * @param {{ message: string, lang: string, intentHint?: string, t: (lang: string, key: string) => string }} opts
 */
export function resolveLocalFaqReply({ message, lang, intentHint, t }) {
  const entry = matchFaq(message, intentHint);
  const reply = t(lang, entry.responseKey) || t(lang, FALLBACK_KEY);
  const escalate = entry.id === 'human' || entry.id === 'fallback';
  return {
    intent: entry.id,
    responseKey: entry.responseKey,
    reply,
    escalate,
    followup: SUPPORT_EMAIL,
    source: 'local',
  };
}
