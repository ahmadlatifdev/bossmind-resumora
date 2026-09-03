/**
 * FAQ catalog for Client Chat.
 * responseKey maps to locales/*.json (chat.faq.*).
 * followup is always the public support inbox — never secrets.
 */
const SUPPORT_EMAIL = 'support@resumora.net';

/** @type {Array<{ id: string, keywords: string[], responseKey: string, followup: string|null }>} */
const FAQ_ENTRIES = [
  {
    id: 'refund',
    keywords: ['refund', 'remboursement', 'reembolso', 'money back', 'rembourser', 'devolver'],
    responseKey: 'chat.faq.billing.refund',
    followup: SUPPORT_EMAIL,
  },
  {
    id: 'cancel',
    keywords: [
      'cancel',
      'annul',
      'résili',
      'resili',
      'cancelar',
      'subscription',
      'abonnement',
      'suscrip',
    ],
    responseKey: 'chat.faq.billing.cancel',
    followup: SUPPORT_EMAIL,
  },
  {
    id: 'payment',
    keywords: [
      'payment',
      'paiement',
      'pago',
      'billing',
      'facture',
      'factura',
      'invoice',
      'charge',
      'checkout',
    ],
    responseKey: 'chat.faq.billing.payment',
    followup: SUPPORT_EMAIL,
  },
  {
    id: 'resume',
    keywords: [
      'resume',
      'cv',
      'studio',
      'cover letter',
      'lettre',
      'carta',
      'document',
      'upload',
      'editor',
    ],
    responseKey: 'chat.faq.resume.studio',
    followup: SUPPORT_EMAIL,
  },
  {
    id: 'account',
    keywords: ['account', 'compte', 'cuenta', 'login', 'sign in', 'connexion', 'perfil', 'profile'],
    responseKey: 'chat.faq.account.general',
    followup: SUPPORT_EMAIL,
  },
  {
    id: 'password',
    keywords: ['password', 'mot de passe', 'contraseña', 'reset', 'forgot', 'oublié', 'olvid'],
    responseKey: 'chat.faq.account.password',
    followup: SUPPORT_EMAIL,
  },
  {
    id: 'privacy',
    keywords: ['privacy', 'confidential', 'données', 'datos', 'gdpr', 'rgpd', 'data', 'privacy'],
    responseKey: 'chat.faq.privacy',
    followup: SUPPORT_EMAIL,
  },
  {
    id: 'technical',
    keywords: [
      'technical',
      'bug',
      'error',
      'broken',
      'crash',
      'technique',
      'técnic',
      'video',
      'vidéo',
      'library',
      'download',
      'ne marche',
      'no funciona',
    ],
    responseKey: 'chat.faq.technical',
    followup: SUPPORT_EMAIL,
  },
  {
    id: 'human',
    keywords: [
      'human',
      'specialist',
      'agent',
      'personne',
      'humain',
      'conseiller',
      'persona',
      'humano',
      'especialista',
      'talk to',
      'parler',
      'hablar',
      'email support',
    ],
    responseKey: 'chat.faq.human',
    followup: SUPPORT_EMAIL,
  },
];

const FALLBACK = {
  id: 'fallback',
  keywords: [],
  responseKey: 'chat.faq.fallback',
  followup: SUPPORT_EMAIL,
};

/** Server-side EN/FR/ES bodies (mirrors locales chat.faq.*) for Cloud Functions. */
const FAQ_BODIES = {
  en: {
    'chat.faq.billing.refund':
      'Refunds depend on how much of your service is already delivered. Open Account to review payments and request a refund preview when available. For billing help, email support@resumora.net — we reply within 24–48 hours.',
    'chat.faq.billing.cancel':
      'You can manage cancellation from Account. Unused work can affect whether a refund applies. Your login stays active until you ask us to close the account. Email support@resumora.net if you need a specialist (24–48 hour reply).',
    'chat.faq.billing.payment':
      'Paid plans are processed securely at checkout. Open Account to view payment history. If a charge looks incorrect, email support@resumora.net with the date and amount — we respond within 24–48 hours.',
    'chat.faq.account.general':
      'Sign in with your Resumora account email to manage your plan, documents, and Video Library. Update profile details from Account. Need help accessing your account? Email support@resumora.net (24–48 hours).',
    'chat.faq.account.password':
      'Use Forgot password / Reset password on the login page to receive a verification code, then set a new password. Never share passwords in chat. If reset fails, email support@resumora.net — we reply within 24–48 hours.',
    'chat.faq.resume.studio':
      'Open Resume Studio while signed in and save often. If Studio will not load, refresh, try another browser, or use a smaller file. Still blocked? Email support@resumora.net with a short description (24–48 hour reply).',
    'chat.faq.privacy':
      'We protect your documents and account data under our privacy practices. We never ask for full card numbers or passwords in chat. Privacy questions: support@resumora.net — response within 24–48 hours.',
    'chat.faq.technical':
      'For playback, download, or page load issues: refresh, try another browser, and confirm your plan is active on Account. Video Library requires an active plan. If it still fails, email support@resumora.net (24–48 hours).',
    'chat.faq.human':
      'A specialist can continue by email. Write to support@resumora.net with your account email and a short description. Do not send passwords or full card numbers. We typically respond within 24–48 hours.',
    'chat.faq.fallback':
      "I couldn't find a specific match. For urgent help, please email support@resumora.net. Our team typically responds within 24–48 hours.",
  },
  fr: {
    'chat.faq.billing.refund':
      'Les remboursements dépendent du travail déjà livré. Ouvrez Compte pour voir vos paiements et demander un aperçu de remboursement. Aide facturation : support@resumora.net — réponse sous 24 à 48 heures.',
    'chat.faq.billing.cancel':
      'La résiliation se gère depuis Compte. Le travail restant peut influer sur un remboursement. Votre connexion reste active tant que vous ne demandez pas la fermeture. Spécialiste : support@resumora.net (24–48 h).',
    'chat.faq.billing.payment':
      'Les forfaits payants passent par un paiement sécurisé. Consultez l’historique dans Compte. Charge incorrecte : support@resumora.net avec date et montant — réponse sous 24 à 48 heures.',
    'chat.faq.account.general':
      'Connectez-vous avec l’e-mail Resumora pour gérer forfait, documents et vidéothèque. Mettez à jour le profil dans Compte. Accès bloqué : support@resumora.net (24–48 h).',
    'chat.faq.account.password':
      'Utilisez Mot de passe oublié sur la page de connexion pour recevoir un code, puis définissez un nouveau mot de passe. N’envoyez jamais de mot de passe dans le chat. Échec : support@resumora.net (24–48 h).',
    'chat.faq.resume.studio':
      'Ouvrez le Studio CV connecté et enregistrez souvent. S’il ne charge pas : actualisez, autre navigateur, fichier plus petit. Toujours bloqué : support@resumora.net (24–48 h).',
    'chat.faq.privacy':
      'Nous protégeons vos documents et données de compte. Nous ne demandons jamais le numéro complet de carte ni le mot de passe dans le chat. Confidentialité : support@resumora.net (24–48 h).',
    'chat.faq.technical':
      'Lecture, téléchargement ou page lente : actualisez, autre navigateur, vérifiez le forfait dans Compte. La vidéothèque exige un forfait actif. Toujours en échec : support@resumora.net (24–48 h).',
    'chat.faq.human':
      'Un spécialiste peut continuer par e-mail. Écrivez à support@resumora.net avec l’e-mail du compte et une courte description. Pas de mot de passe ni numéro de carte. Réponse typique sous 24 à 48 heures.',
    'chat.faq.fallback':
      'Je n’ai pas trouvé de correspondance précise. Pour une aide urgente, écrivez à support@resumora.net. Notre équipe répond généralement sous 24 à 48 heures.',
  },
  es: {
    'chat.faq.billing.refund':
      'Los reembolsos dependen de cuánto servicio ya se entregó. Abra Cuenta para ver pagos y solicitar una vista previa de reembolso. Ayuda de cobro: support@resumora.net — respuesta en 24–48 horas.',
    'chat.faq.billing.cancel':
      'Gestione la cancelación en Cuenta. El trabajo no usado puede afectar un reembolso. El acceso permanece hasta que pida cerrar la cuenta. Especialista: support@resumora.net (24–48 h).',
    'chat.faq.billing.payment':
      'Los planes de pago se procesan de forma segura. Vea el historial en Cuenta. Si un cargo es incorrecto, escriba a support@resumora.net con fecha e importe — respuesta en 24–48 horas.',
    'chat.faq.account.general':
      'Inicie sesión con el correo de Resumora para gestionar plan, documentos y videoteca. Actualice el perfil en Cuenta. ¿Problemas de acceso? support@resumora.net (24–48 h).',
    'chat.faq.account.password':
      'Use Olvidé mi contraseña en el inicio de sesión para recibir un código y crear una nueva. No comparta contraseñas en el chat. Si falla: support@resumora.net (24–48 h).',
    'chat.faq.resume.studio':
      'Abra el Studio de CV con sesión iniciada y guarde a menudo. Si no carga: actualice, otro navegador o un archivo más pequeño. ¿Sigue bloqueado? support@resumora.net (24–48 h).',
    'chat.faq.privacy':
      'Protegemos sus documentos y datos de cuenta. Nunca pedimos el número completo de tarjeta ni contraseñas en el chat. Privacidad: support@resumora.net (24–48 h).',
    'chat.faq.technical':
      'Reproducción, descarga o carga lenta: actualice, pruebe otro navegador y confirme el plan en Cuenta. La videoteca requiere un plan activo. Si falla: support@resumora.net (24–48 h).',
    'chat.faq.human':
      'Un especialista puede continuar por correo. Escriba a support@resumora.net con el correo de la cuenta y una descripción breve. No envíe contraseñas ni el número completo de la tarjeta. Respuesta habitual en 24–48 horas.',
    'chat.faq.fallback':
      'No encontré una coincidencia concreta. Para ayuda urgente, escriba a support@resumora.net. Nuestro equipo suele responder en 24–48 horas.',
  },
};

function normalizeLang(lang) {
  const raw = String(lang || 'en')
    .toLowerCase()
    .slice(0, 2);
  return raw === 'fr' || raw === 'es' ? raw : 'en';
}

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function matchFaqEntry(message, intentHint) {
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
  return bestHits > 0 ? best : FALLBACK;
}

function resolveFaqReply({ message, lang, intentHint }) {
  const entry = matchFaqEntry(message, intentHint);
  const code = normalizeLang(lang);
  const bodies = FAQ_BODIES[code] || FAQ_BODIES.en;
  const reply =
    bodies[entry.responseKey] ||
    FAQ_BODIES.en[entry.responseKey] ||
    FAQ_BODIES.en['chat.faq.fallback'];
  const escalate = entry.id === 'human' || entry.id === 'fallback';
  return {
    intent: entry.id,
    responseKey: entry.responseKey,
    reply,
    followup: entry.followup || SUPPORT_EMAIL,
    escalate,
  };
}

module.exports = {
  SUPPORT_EMAIL,
  FAQ_ENTRIES,
  FALLBACK,
  FAQ_BODIES,
  matchFaqEntry,
  resolveFaqReply,
  normalizeLang,
};
