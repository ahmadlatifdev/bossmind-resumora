/**
 * No-reply transactional notifications via Resend.
 * From: support@resumora.net — never logs API keys.
 */
const mail = require('./mail');

const SUPPORT_FROM =
  String(process.env.SUPPORT_EMAIL_FROM || '').trim() || 'Resumora Support <support@resumora.net>';

const TEMPLATES = {
  en: {
    'payment.succeeded': {
      subject: 'Payment received — Resumora',
      text: 'Thank you. Your Resumora payment succeeded and your plan is active.\n\nThis mailbox is no-reply. For help, use Client Chat in your account or email support@resumora.net.',
    },
    'refund.processed': {
      subject: 'Refund processed — Resumora',
      text: 'Your Resumora refund has been processed. Access may be deactivated.\n\nThis mailbox is no-reply. Questions: support@resumora.net via Client Chat.',
    },
    'account.activated': {
      subject: 'Account activated — Resumora',
      text: 'Your Resumora account is active. Studio, Video Library, and Client Chat are unlocked.\n\nThis mailbox is no-reply.',
    },
    'plan.cancelled': {
      subject: 'Cancel / refund request received — Resumora',
      text: 'We received your cancel/refund request. Our team will review it shortly.\n\nThis mailbox is no-reply.',
    },
    'document.uploaded': {
      subject: 'Document received — Resumora',
      text: 'We received your uploaded document in Resume Studio.\n\nThis mailbox is no-reply.',
    },
    'download.completed': {
      subject: 'Download completed — Resumora',
      text: 'Your Resumora download completed successfully.\n\nThis mailbox is no-reply.',
    },
  },
  fr: {
    'payment.succeeded': {
      subject: 'Paiement reçu — Resumora',
      text: 'Merci. Votre paiement Resumora a réussi et votre forfait est actif.\n\nBoîte no-reply. Aide : Chat client ou support@resumora.net.',
    },
    'refund.processed': {
      subject: 'Remboursement traité — Resumora',
      text: 'Votre remboursement Resumora a été traité. L’accès peut être désactivé.\n\nBoîte no-reply.',
    },
    'account.activated': {
      subject: 'Compte activé — Resumora',
      text: 'Votre compte Resumora est actif. Studio, vidéos et chat client sont débloqués.\n\nBoîte no-reply.',
    },
    'plan.cancelled': {
      subject: 'Demande d’annulation reçue — Resumora',
      text: 'Nous avons reçu votre demande d’annulation/remboursement. Examen sous peu.\n\nBoîte no-reply.',
    },
    'document.uploaded': {
      subject: 'Document reçu — Resumora',
      text: 'Nous avons reçu votre document dans Resume Studio.\n\nBoîte no-reply.',
    },
    'download.completed': {
      subject: 'Téléchargement terminé — Resumora',
      text: 'Votre téléchargement Resumora est terminé.\n\nBoîte no-reply.',
    },
  },
  es: {
    'payment.succeeded': {
      subject: 'Pago recibido — Resumora',
      text: 'Gracias. Su pago de Resumora se completó y su plan está activo.\n\nBuzón no-reply. Ayuda: Chat del cliente o support@resumora.net.',
    },
    'refund.processed': {
      subject: 'Reembolso procesado — Resumora',
      text: 'Su reembolso de Resumora fue procesado. El acceso puede desactivarse.\n\nBuzón no-reply.',
    },
    'account.activated': {
      subject: 'Cuenta activada — Resumora',
      text: 'Su cuenta Resumora está activa. Studio, videos y chat están desbloqueados.\n\nBuzón no-reply.',
    },
    'plan.cancelled': {
      subject: 'Solicitud de cancelación recibida — Resumora',
      text: 'Recibimos su solicitud de cancelación/reembolso. La revisaremos pronto.\n\nBuzón no-reply.',
    },
    'document.uploaded': {
      subject: 'Documento recibido — Resumora',
      text: 'Recibimos su documento en Resume Studio.\n\nBuzón no-reply.',
    },
    'download.completed': {
      subject: 'Descarga completada — Resumora',
      text: 'Su descarga de Resumora se completó.\n\nBuzón no-reply.',
    },
  },
};

/**
 * @param {{ to: string, templateKey: string, locale?: string, extraText?: string }} opts
 */
async function sendNotificationEmail({ to, templateKey, locale = 'en', extraText = '' }) {
  const lang = ['en', 'fr', 'es'].includes(String(locale).slice(0, 2))
    ? String(locale).slice(0, 2)
    : 'en';
  const pack = TEMPLATES[lang] || TEMPLATES.en;
  const tpl = pack[templateKey] || TEMPLATES.en[templateKey];
  if (!tpl) {
    console.warn('[notifications] unknown template', templateKey);
    return { skipped: true, reason: 'unknown_template' };
  }
  const text = extraText ? `${tpl.text}\n\n${extraText}` : tpl.text;
  return mail.sendTransactionalEmail({
    to,
    subject: tpl.subject,
    text,
    html: `<p>${text.replace(/\n/g, '<br/>')}</p>`,
    from: SUPPORT_FROM,
    replyTo: 'support@resumora.net',
    headers: {
      'X-Resumora-No-Reply': '1',
      'Auto-Submitted': 'auto-generated',
    },
    tags: [{ name: 'category', value: String(templateKey).replace(/\./g, '_') }],
  });
}

module.exports = {
  sendNotificationEmail,
  SUPPORT_FROM,
  TEMPLATES,
};
