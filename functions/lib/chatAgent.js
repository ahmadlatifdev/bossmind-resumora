/**
 * Policy-driven Client Chat replies. Language via locale maps (EN/FR/ES).
 * Never logs secret values. Do not mention model names in user-facing text.
 */
const fs = require('fs');
const path = require('path');

const POLICY_PATH = path.join(__dirname, '..', 'support_policy.md');

const REPLIES = {
  en: {
    refund:
      'Refunds depend on how much of your service is already delivered. Open Account to review payments and request a refund preview when it is available. For urgent billing help, email support@resumora.net.',
    cancel:
      'You can manage cancellation from Account. Unused work can affect whether a refund applies. Your login stays active until you ask us to close the account. Need a specialist? Email support@resumora.net.',
    studio:
      'Open Resume Studio while signed in and save often. If Studio will not load, refresh, try another browser, or use a smaller file. If it is still blocked, email support@resumora.net with a short description of the screen.',
    video:
      'Video Library requires an active plan. Sign in, then open Video Library. Downloads are limited per account. If a video will not play, confirm your plan on Account and retry. Still stuck? Email support@resumora.net.',
    human:
      'A specialist can continue by email. Write to support@resumora.net with the email on your account and a short description. Do not send passwords or full card numbers.',
    fallback:
      "I couldn't find a specific match. For urgent help, please email support@resumora.net.",
  },
  fr: {
    refund:
      'Les remboursements dépendent du travail déjà livré. Ouvrez Compte pour voir vos paiements et demander un aperçu de remboursement s’il est disponible. Pour une urgence facturation : support@resumora.net.',
    cancel:
      'La résiliation se gère depuis Compte. Le travail restant peut influer sur un remboursement. Votre connexion reste active tant que vous ne demandez pas la fermeture. Besoin d’un spécialiste : support@resumora.net.',
    studio:
      'Ouvrez le Studio CV une fois connecté et enregistrez souvent. S’il ne charge pas, actualisez, changez de navigateur ou réduisez le fichier. Toujours bloqué : support@resumora.net avec une brève description de l’écran.',
    video:
      'La vidéothèque nécessite un forfait actif. Connectez-vous puis ouvrez la vidéothèque. Les téléchargements sont limités par compte. Si une vidéo ne lit pas, vérifiez le forfait dans Compte. Toujours bloqué : support@resumora.net.',
    human:
      'Un spécialiste peut continuer par e-mail. Écrivez à support@resumora.net avec l’e-mail du compte et une courte description. N’envoyez pas de mot de passe ni le numéro complet de carte.',
    fallback:
      'Je n’ai pas trouvé de correspondance précise. Pour une aide urgente, écrivez à support@resumora.net.',
  },
  es: {
    refund:
      'Los reembolsos dependen de cuánto servicio ya se entregó. Abra Cuenta para ver pagos y solicitar una vista previa de reembolso cuando esté disponible. Urgencias de cobro: support@resumora.net.',
    cancel:
      'Puede gestionar la cancelación en Cuenta. El trabajo no usado puede afectar un reembolso. El acceso permanece hasta que pida cerrar la cuenta. ¿Necesita un especialista? support@resumora.net.',
    studio:
      'Abra el Studio de CV con la sesión iniciada y guarde a menudo. Si no carga, actualice, pruebe otro navegador o un archivo más pequeño. Si sigue bloqueado, escriba a support@resumora.net con una breve descripción.',
    video:
      'La videoteca requiere un plan activo. Inicie sesión y ábrala. Las descargas tienen límite por cuenta. Si un video no se reproduce, confirme el plan en Cuenta. ¿Sigue fallando? support@resumora.net.',
    human:
      'Un especialista puede continuar por correo. Escriba a support@resumora.net con el correo de la cuenta y una descripción breve. No envíe contraseñas ni el número completo de la tarjeta.',
    fallback:
      'No encontré una coincidencia concreta. Para ayuda urgente, escriba a support@resumora.net.',
  },
};

const INTENT_KEYWORDS = {
  human: [
    'human',
    'specialist',
    'agent',
    'personne',
    'humain',
    'conseiller',
    'persona',
    'humano',
    'especialista',
    'email support',
    'talk to',
    'parler',
    'hablar',
  ],
  refund: [
    'refund',
    'remboursement',
    'reembolso',
    'payment',
    'paiement',
    'pago',
    'charge',
    'invoice',
    'facture',
    'factura',
    'billing',
    'stripe',
    'money',
    'argent',
    'dinero',
  ],
  cancel: [
    'cancel',
    'annul',
    'résili',
    'resili',
    'cancelar',
    'subscription',
    'abonnement',
    'suscrip',
  ],
  studio: [
    'resume',
    'cv',
    'studio',
    'editor',
    'cover letter',
    'lettre',
    'carta',
    'document',
    'upload',
    'télécharg',
    'subir',
  ],
  video: [
    'video',
    'vidéo',
    'library',
    'vidéothèque',
    'videoteca',
    'download',
    'bilibili',
    'play',
    'lecture',
    'reproduc',
  ],
};

let policyCache = null;

function normalizeLang(lang) {
  const raw = String(lang || 'en')
    .toLowerCase()
    .slice(0, 2);
  return raw === 'fr' || raw === 'es' ? raw : 'en';
}

function t(lang, intent) {
  const code = normalizeLang(lang);
  const table = REPLIES[code] || REPLIES.en;
  return table[intent] || REPLIES.en.fallback;
}

function loadPolicyText() {
  if (policyCache) return policyCache;
  try {
    policyCache = fs.readFileSync(POLICY_PATH, 'utf8');
  } catch {
    policyCache = '';
  }
  return policyCache;
}

function policyHasSection(intent) {
  const text = loadPolicyText();
  if (!text) return false;
  const needle = `## ${intent}`;
  return text.toLowerCase().includes(needle.toLowerCase());
}

function classifyIntent(message, hinted) {
  const hint = String(hinted || '')
    .toLowerCase()
    .trim();
  if (['refund', 'cancel', 'studio', 'video', 'human'].includes(hint)) return hint;

  const hay = String(message || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  let best = 'fallback';
  let bestHits = 0;
  for (const [intent, words] of Object.entries(INTENT_KEYWORDS)) {
    let hits = 0;
    for (const w of words) {
      const needle = w.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      if (needle && hay.includes(needle)) hits += 1;
    }
    if (hits > bestHits) {
      bestHits = hits;
      best = intent;
    }
  }
  return bestHits > 0 ? best : 'fallback';
}

function resolveChatReply({ message, lang, intentHint }) {
  loadPolicyText();
  const intent = classifyIntent(message, intentHint);
  const policyOk = intent === 'fallback' || policyHasSection(intent);
  const reply = t(lang, policyOk ? intent : 'fallback');
  return {
    intent: policyOk ? intent : 'fallback',
    reply,
    escalate: intent === 'human' || intent === 'fallback' || !policyOk,
  };
}

module.exports = {
  resolveChatReply,
  classifyIntent,
  normalizeLang,
  t,
};
