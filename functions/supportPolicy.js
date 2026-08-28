/**
 * Policy-driven support replies (rule-based; optional OpenAI if OPENAI_API_KEY set).
 * Never logs API keys. Never expose Stripe secret/price ids to clients.
 */
const fs = require('fs');
const path = require('path');

const POLICY_PATH = path.join(__dirname, 'support_policy.md');

function loadPolicyText() {
  try {
    return fs.readFileSync(POLICY_PATH, 'utf8');
  } catch (_) {
    return 'Resumora one-time plans; refunds need admin approval; Client Chat for paid members.';
  }
}

function normalize(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/**
 * Rule-based answer from support_policy.md keywords.
 * Concise, polite, bullet-structured where helpful.
 */
function answerFromPolicy(question, locale = 'en') {
  const q = normalize(question);
  const lang = ['en', 'fr', 'es'].includes(locale) ? locale : 'en';

  const replies = {
    en: {
      payments:
        'Happy to help.\n\nTo view your payment history:\n• Go to My Account\n• Open the Transactions tab\n• Use Invoices for receipts when available\n\nYou can also tap “View Payment History” in this chat.',
      refund:
        'Certainly.\n\nTo cancel or request a refund:\n• Open My Account → Plan (or Transactions)\n• Enter a short cancel reason\n• Submit for review\n\nOur team approves refunds before they are processed. Your plan stays active until a refund is approved.',
      upload:
        'For upload or download issues:\n• Use Resume Studio for resume uploads (PDF or DOCX preferred)\n• Check My Account → Documents for recorded downloads\n• Confirm you are signed in with an active plan\n\nIf a file still fails, reply here with the file type and what you see on screen.',
      account:
        'Your Resumora account details live in My Account:\n• Plan — current membership status\n• Transactions — payment history\n• Invoices — receipts\n• Documents — uploads and downloads\n\nPassword help: use /reset-password.',
      access:
        'Paid features (Studio, Video Library, Client Chat) require an active plan.\n\n• Sign in at resumora.net\n• Choose a plan on Pricing if inactive\n• Return to My Account to confirm status',
      chat: 'Client Chat is available to active paid members.\n\nTransactional email is sent no-reply from support@resumora.net. For billing details, use My Account or the Payment History button below.',
      plan: 'Resumora offers one-time lifetime plans:\n• Basic · Pro · Business · Enterprise\n\nThese are not monthly subscriptions. See /pricing to compare and purchase.',
      password:
        'To reset your password:\n• Visit /reset-password\n• Enter your email\n• Follow the secure link we send\n\nCheck Spam if you do not see the message within a few minutes.',
      default:
        'Thank you for contacting Resumora support.\n\nI can help with:\n• Payment history (My Account → Transactions)\n• Cancel / refund (My Account → Plan)\n• Uploads, downloads, and plan access\n\nAsk a specific question, or use View Payment History below.',
    },
    fr: {
      payments:
        'Avec plaisir.\n\nPour voir votre historique de paiements :\n• Ouvrez Mon compte\n• Onglet Transactions\n• Onglet Factures pour les reçus\n\nVous pouvez aussi utiliser « Voir l’historique des paiements » dans ce chat.',
      refund:
        'Bien sûr.\n\nPour annuler ou demander un remboursement :\n• Mon compte → Forfait (ou Transactions)\n• Indiquez une brève raison\n• Envoyez pour examen\n\nLe forfait reste actif jusqu’à approbation du remboursement.',
      upload:
        'Pour les téléversements / téléchargements :\n• Resume Studio pour les CV (PDF ou DOCX)\n• Mon compte → Documents pour l’historique\n• Vérifiez que votre forfait est actif\n\nSinon, précisez le type de fichier et le message d’erreur.',
      account:
        'Dans Mon compte :\n• Forfait — statut\n• Transactions — paiements\n• Factures — reçus\n• Documents — fichiers\n\nMot de passe : /reset-password.',
      access:
        'Studio, vidéothèque et chat nécessitent un forfait actif.\n\n• Connectez-vous\n• Choisissez un forfait sur Tarifs si besoin\n• Vérifiez le statut dans Mon compte',
      chat: 'Le chat client est réservé aux membres payants actifs.\n\nLes e-mails transactionnels partent en no-reply depuis support@resumora.net.',
      plan: 'Forfaits à vie (paiement unique) :\n• Basic · Pro · Business · Enterprise\n\nPas d’abonnement mensuel. Voir /pricing.',
      password:
        'Réinitialisation :\n• Allez sur /reset-password\n• Entrez votre e-mail\n• Suivez le lien sécurisé\n\nVérifiez les indésirables si besoin.',
      default:
        'Merci de contacter le support Resumora.\n\nJe peux vous aider pour :\n• Historique des paiements\n• Annulation / remboursement\n• Accès, téléversements et documents\n\nPosez votre question ou utilisez le bouton Historique des paiements.',
    },
    es: {
      payments:
        'Con gusto.\n\nPara ver su historial de pagos:\n• Vaya a Mi cuenta\n• Abra Transacciones\n• Use Facturas para recibos\n\nTambién puede pulsar «Ver historial de pagos» en este chat.',
      refund:
        'Por supuesto.\n\nPara cancelar o solicitar reembolso:\n• Mi cuenta → Plan (o Transacciones)\n• Escriba un motivo breve\n• Envíe para revisión\n\nSu plan permanece activo hasta que se apruebe el reembolso.',
      upload:
        'Para cargas o descargas:\n• Use Resume Studio (PDF o DOCX)\n• Revise Mi cuenta → Documentos\n• Confirme que su plan está activo\n\nSi falla, indique el tipo de archivo y el mensaje en pantalla.',
      account:
        'En Mi cuenta encontrará:\n• Plan — estado\n• Transacciones — pagos\n• Facturas — recibos\n• Documentos — archivos\n\nContraseña: /reset-password.',
      access:
        'Studio, biblioteca de videos y chat requieren plan activo.\n\n• Inicie sesión\n• Elija un plan en Precios si está inactivo\n• Confirme el estado en Mi cuenta',
      chat: 'El chat es solo para miembros de pago activos.\n\nLos correos transaccionales son no-reply desde support@resumora.net.',
      plan: 'Planes de por vida (pago único):\n• Basic · Pro · Business · Enterprise\n\nNo son suscripciones mensuales. Ver /pricing.',
      password:
        'Para restablecer la contraseña:\n• Visite /reset-password\n• Ingrese su correo\n• Siga el enlace seguro\n\nRevise Spam si no llega.',
      default:
        'Gracias por contactar al soporte de Resumora.\n\nPuedo ayudar con:\n• Historial de pagos\n• Cancelación / reembolso\n• Acceso, cargas y documentos\n\nFormule su pregunta o use Ver historial de pagos.',
    },
  };

  const R = replies[lang] || replies.en;
  if (
    /payment|paiement|pago|invoice|facture|factura|receipt|recu|historial|history|historique/.test(
      q
    )
  )
    return R.payments;
  if (/refund|rembours|reembol|cancel|annul/.test(q)) return R.refund;
  if (
    /upload|download|telecharg|televers|descarg|cargar|document|fichier|archivo|resume|cv/.test(q)
  )
    return R.upload;
  if (/password|mot de passe|contrasena|reset/.test(q)) return R.password;
  if (/account|compte|cuenta|profile|profil|perfil/.test(q)) return R.account;
  if (/chat|support|aide|ayuda/.test(q)) return R.chat;
  if (/plan|pricing|tarif|precio|basic|pro|enterprise|forfait/.test(q)) return R.plan;
  if (/access|studio|video|library|actif|active|acceso/.test(q)) return R.access;
  return R.default;
}

async function generateSupportReply(question, locale = 'en') {
  const policy = loadPolicyText();
  const apiKey = String(process.env.OPENAI_API_KEY || '').trim();
  if (apiKey) {
    try {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: process.env.OPENAI_SUPPORT_MODEL || 'gpt-4o-mini',
          temperature: 0.2,
          max_tokens: 450,
          messages: [
            {
              role: 'system',
              content:
                `You are a professional Resumora support specialist. Answer ONLY from this policy. Language: ${locale}. ` +
                `Be concise, polite, and structured with short bullet points when listing steps. ` +
                `Never say you are an AI, GPT, or bot. Never mention Stripe dashboard, secret keys, or price IDs. ` +
                `For payment history, direct users to My Account → Transactions (or the in-chat Payment History button).\n\n${policy}`,
            },
            { role: 'user', content: String(question || '').slice(0, 2000) },
          ],
        }),
      });
      if (res.ok) {
        const json = await res.json();
        const text = json?.choices?.[0]?.message?.content;
        if (text) return String(text).trim();
      }
    } catch (err) {
      console.warn(
        '[supportPolicy] openai failed',
        String(err && err.message ? err.message : err).slice(0, 120)
      );
    }
  }
  return answerFromPolicy(question, locale);
}

module.exports = {
  loadPolicyText,
  answerFromPolicy,
  generateSupportReply,
};
