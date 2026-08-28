/**
 * Multilingual support agent for info@resumora.net
 * - Authorizes registered customers only
 * - Drafts policy-grounded replies (never auto-sends to customer)
 * - Human-in-the-loop approval before Resend send
 * - Escalates refunds/cancels and low-confidence after 2 attempts
 * Never logs API keys or Stripe secrets.
 */
const crypto = require('crypto');
const { FieldValue } = require('firebase-admin/firestore');
const { getAuth } = require('firebase-admin/auth');
const { sendTransactionalEmail } = require('./mail');

const COLLECTION = 'support_tickets';
const MAX_AI_ATTEMPTS = 2;
const SUPPORT_INBOX = 'info@resumora.net';

const POLICIES = {
  refund:
    'Refunds are issued within 72 hours of a purchase if the service is not provided. Refunds are not issued for accounts suspended due to policy violations.',
  accountUsage:
    'Each account may be used to create resumes for a maximum of 3 people. Creating resumes for more than 3 people or for commercial purposes violates our Terms of Service.',
  access:
    'A free account is required to build and save resumes. Pro plans unlock unlimited downloads and advanced tools.',
};

const SYSTEM_COPY = {
  en: {
    received: 'We have received your request and will respond shortly.',
    pendingApproval: 'A support draft is ready for your approval.',
    escalated: 'This conversation was escalated for human review.',
    unauthorized:
      'We could only process support requests from registered Resumora customer emails. Please write from the email on your account, or register at https://resumora.net/login',
    humanRequired:
      'A team member will review your request manually. We do not process refunds or cancellations automatically.',
  },
  fr: {
    received: 'Nous avons bien reçu votre demande et vous répondrons sous peu.',
    pendingApproval: 'Un brouillon de réponse est prêt pour votre approbation.',
    escalated: 'Cette conversation a été transmise à un agent humain.',
    unauthorized:
      'Nous ne pouvons traiter que les demandes provenant d’e-mails clients Resumora enregistrés. Écrivez depuis l’e-mail de votre compte, ou inscrivez-vous sur https://resumora.net/login',
    humanRequired:
      'Un membre de l’équipe examinera votre demande manuellement. Nous ne traitons pas les remboursements ou annulations automatiquement.',
  },
  es: {
    received: 'Hemos recibido tu solicitud y responderemos en breve.',
    pendingApproval: 'Un borrador de respuesta está listo para tu aprobación.',
    escalated: 'Esta conversación se escaló a revisión humana.',
    unauthorized:
      'Solo procesamos solicitudes desde correos de clientes Resumora registrados. Escribe desde el correo de tu cuenta, o regístrate en https://resumora.net/login',
    humanRequired:
      'Un miembro del equipo revisará tu solicitud manualmente. No procesamos reembolsos ni cancelaciones de forma automática.',
  },
};

function normalizeLang(code) {
  const raw = String(code || 'en')
    .toLowerCase()
    .slice(0, 2);
  return raw === 'fr' || raw === 'es' ? raw : 'en';
}

function detectLangFromText(text) {
  const t = String(text || '').toLowerCase();
  if (/[àâäéèêëïîôùûüç]/.test(t) || /\b(bonjour|merci|remboursement|compte)\b/.test(t)) {
    return 'fr';
  }
  if (/[áéíóúñ¿¡]/.test(t) || /\b(hola|gracias|reembolso|cuenta)\b/.test(t)) {
    return 'es';
  }
  return 'en';
}

function parseFromHeader(from) {
  const raw = String(from || '').trim();
  const m = raw.match(/^(.*)<([^>]+)>$/);
  if (m) {
    return {
      name: m[1].replace(/["']/g, '').trim() || m[2].split('@')[0],
      email: m[2].trim().toLowerCase(),
    };
  }
  if (raw.includes('@')) {
    return { name: raw.split('@')[0], email: raw.toLowerCase() };
  }
  return { name: '', email: '' };
}

function needsHumanEscalation(message) {
  const t = String(message || '').toLowerCase();
  return (
    /\b(refund|remboursement|reembolso|chargeback|cancel|annul|cancelar|subscription|abonnement|suscripci[oó]n)\b/i.test(
      t
    ) || /\b(lawyer|attorney|avocat|abogado|gdpr|ccpa|legal)\b/i.test(t)
  );
}

function extractInboundPayload(body) {
  const root = body && body.data ? body.data : body || {};
  const fromRaw =
    root.from ||
    (root.from_email && root.from_name
      ? `${root.from_name} <${root.from_email}>`
      : root.from_email) ||
    '';
  const parsed = parseFromHeader(fromRaw);
  const subject = root.subject || root.Subject || '(no subject)';
  const text =
    root.text ||
    root.text_body ||
    root.plain ||
    (typeof root.html === 'string' ? root.html.replace(/<[^>]+>/g, ' ') : '') ||
    root.body ||
    '';
  const messageId =
    root.message_id ||
    root.messageId ||
    (root.headers && (root.headers['message-id'] || root.headers['Message-ID'])) ||
    '';
  const inReplyTo =
    root.in_reply_to ||
    (root.headers && (root.headers['in-reply-to'] || root.headers['In-Reply-To'])) ||
    '';
  const references =
    root.references || (root.headers && (root.headers.references || root.headers.References)) || '';
  const emailId = root.email_id || root.id || '';
  return {
    fromEmail: parsed.email,
    fromName: parsed.name,
    subject: String(subject),
    text: String(text).trim(),
    messageId: String(messageId || ''),
    inReplyTo: String(inReplyTo || ''),
    references: String(references || ''),
    emailId: String(emailId || ''),
    rawType: body && body.type ? String(body.type) : '',
  };
}

async function findRegisteredCustomer(db, email) {
  const normalized = String(email || '')
    .trim()
    .toLowerCase();
  if (!normalized) return null;

  try {
    const user = await getAuth().getUserByEmail(normalized);
    const snap = await db.collection('users').doc(user.uid).get();
    const profile = snap.exists ? snap.data() || {} : {};
    return {
      uid: user.uid,
      email: normalized,
      fullName: profile.fullName || user.displayName || normalized.split('@')[0],
      plan: profile.plan || profile.planId || null,
      planStatus: profile.planStatus || profile.subscriptionStatus || 'pending',
      locale: normalizeLang(profile.locale || profile.preferredLang || profile.language || 'en'),
    };
  } catch (_) {
    /* continue to Firestore email query */
  }

  try {
    const q = await db.collection('users').where('email', '==', normalized).limit(1).get();
    if (q.empty) return null;
    const doc = q.docs[0];
    const profile = doc.data() || {};
    return {
      uid: doc.id,
      email: normalized,
      fullName: profile.fullName || normalized.split('@')[0],
      plan: profile.plan || profile.planId || null,
      planStatus: profile.planStatus || profile.subscriptionStatus || 'pending',
      locale: normalizeLang(profile.locale || profile.preferredLang || profile.language || 'en'),
    };
  } catch (err) {
    console.error('[supportAgent] customer lookup failed', err && err.message);
    return null;
  }
}

function buildPolicyPrompt({ locale, customer, message, subject }) {
  return [
    'You are Resumora customer support for resumora.net.',
    `Reply ONLY in language code: ${locale} (en, fr, or es).`,
    'Ground every answer strictly in these policies:',
    `- Refund: ${POLICIES.refund}`,
    `- Account usage: ${POLICIES.accountUsage}`,
    `- Access: ${POLICIES.access}`,
    'Rules:',
    '- Do NOT process refunds, cancellations, or account changes.',
    '- If the user asks for a refund/cancel/legal matter, set action to escalate and explain a human will help.',
    '- If the question is outside policy, set action to escalate (do not invent policy).',
    '- Be concise, professional, and helpful.',
    '- If you can answer from policy, set action to draft.',
    'Customer context:',
    `- Name: ${customer.fullName}`,
    `- Plan: ${customer.plan || 'unknown'} (${customer.planStatus || 'unknown'})`,
    `- Locale preference: ${customer.locale}`,
    `Subject: ${subject}`,
    `Message: ${message}`,
    'Respond as JSON only: {"action":"draft"|"escalate","confidence":0-1,"reply":"...","reason":"..."}',
  ].join('\n');
}

function fallbackDraft({ locale, message, escalate }) {
  const copy = SYSTEM_COPY[locale] || SYSTEM_COPY.en;
  if (escalate || needsHumanEscalation(message)) {
    return {
      action: 'escalate',
      confidence: 0.2,
      reply: copy.humanRequired,
      reason: 'policy_sensitive_or_uncovered',
    };
  }
  // Policy-grounded canned reply (no LLM)
  const lower = String(message || '').toLowerCase();
  let reply;
  if (/refund|rembours|reembolso/.test(lower)) {
    reply = POLICIES.refund;
  } else if (/3 people|trois|tres personas|commercial|commercial/.test(lower)) {
    reply = POLICIES.accountUsage;
  } else if (/download|t[eé]l[eé]charg|descarg|pro plan|forfait|plan/.test(lower)) {
    reply = POLICIES.access;
  } else {
    reply = `${copy.received}\n\n${copy.humanRequired}`;
    return { action: 'escalate', confidence: 0.3, reply, reason: 'no_llm_or_unclear' };
  }
  // Translate-ish: keep EN policies; for FR/ES prepend acknowledgment in locale
  if (locale === 'fr') {
    reply = `Selon la politique Resumora :\n\n${reply}\n\n${copy.humanRequired}`;
  } else if (locale === 'es') {
    reply = `Según la política de Resumora:\n\n${reply}\n\n${copy.humanRequired}`;
  } else {
    reply = `Per Resumora policy:\n\n${reply}`;
  }
  return { action: 'draft', confidence: 0.55, reply, reason: 'template_policy' };
}

async function callOpenAiDraft(prompt) {
  const key = String(process.env.OPENAI_API_KEY || process.env.AI_API_KEY || '').trim();
  if (!key) return null;
  const model = String(process.env.SUPPORT_AI_MODEL || 'gpt-4o-mini').trim();
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: 'You are a careful support agent. Output valid JSON only.' },
        { role: 'user', content: prompt },
      ],
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    console.error('[supportAgent] OpenAI error', res.status, body.slice(0, 200));
    return null;
  }
  const json = await res.json();
  const content =
    json && json.choices && json.choices[0] && json.choices[0].message
      ? json.choices[0].message.content
      : '';
  try {
    return JSON.parse(content);
  } catch (_) {
    return {
      action: 'draft',
      confidence: 0.4,
      reply: String(content || ''),
      reason: 'parse_fallback',
    };
  }
}

async function notifyAdmin(ticket) {
  const admin =
    String(process.env.SUPPORT_ADMIN_EMAIL || process.env.ADMIN_NOTIFY_EMAIL || '').trim() ||
    'latif@resumora.net';
  const subject = `[Resumora Support] ${ticket.status === 'escalated' ? 'ESCALATED' : 'Draft pending'} — ${ticket.customerEmail}`;
  const text = [
    ticket.status === 'escalated'
      ? 'Human Review Required'
      : 'Approve or edit this draft before it is sent.',
    '',
    `Ticket: ${ticket.id}`,
    `From: ${ticket.customerName} <${ticket.customerEmail}>`,
    `Plan: ${ticket.plan || '—'} (${ticket.planStatus || '—'})`,
    `Locale: ${ticket.locale}`,
    `Subject: ${ticket.subject}`,
    '',
    '--- Customer message ---',
    ticket.inboundText,
    '',
    '--- AI draft ---',
    ticket.draftReply || '(none)',
    '',
    `Reason: ${ticket.draftReason || '—'}`,
    `AI attempts: ${ticket.aiAttempts || 0}`,
    '',
    'Approve via:',
    'POST https://resumora.net/api/admin/support/decide',
    'Header: X-Admin-Password: <ADMIN_REFUND_PASSWORD>',
    `Body: {"ticketId":"${ticket.id}","decision":"approve"}`,
    'Or decision "reject" / "edit" with "editedBody".',
  ].join('\n');

  return sendTransactionalEmail({
    to: admin,
    subject,
    text,
    from: process.env.SUPPORT_EMAIL_FROM || undefined,
    tags: [{ name: 'category', value: 'support_admin' }],
  });
}

async function sendUnauthorizedNotice(toEmail, locale) {
  const copy = SYSTEM_COPY[locale] || SYSTEM_COPY.en;
  return sendTransactionalEmail({
    to: toEmail,
    subject: 'Resumora Support',
    text: copy.unauthorized,
    from: process.env.SUPPORT_EMAIL_FROM || `Resumora Support <${SUPPORT_INBOX}>`,
    tags: [{ name: 'category', value: 'support_unauthorized' }],
  });
}

async function sendAckToCustomer(toEmail, locale, headers) {
  const copy = SYSTEM_COPY[locale] || SYSTEM_COPY.en;
  const threadHeaders = {};
  if (headers.messageId) {
    threadHeaders['In-Reply-To'] = headers.messageId;
    threadHeaders.References = headers.references
      ? `${headers.references} ${headers.messageId}`
      : headers.messageId;
  }
  return sendTransactionalEmail({
    to: toEmail,
    subject: 'Re: Resumora Support',
    text: copy.received,
    from: process.env.SUPPORT_EMAIL_FROM || `Resumora Support <${SUPPORT_INBOX}>`,
    headers: Object.keys(threadHeaders).length ? threadHeaders : undefined,
    tags: [{ name: 'category', value: 'support_ack' }],
  });
}

/**
 * Handle Resend inbound email webhook payload.
 */
async function handleInboundSupportEmail(db, body) {
  const inbound = extractInboundPayload(body);
  if (!inbound.fromEmail || !inbound.text) {
    return { ok: false, error: 'missing_from_or_body', statusCode: 400 };
  }

  // Ignore mail we sent ourselves
  if (
    inbound.fromEmail.endsWith('@resumora.net') &&
    /info@|support@|billing@/i.test(inbound.fromEmail)
  ) {
    return { ok: true, ignored: true, reason: 'self' };
  }

  const customer = await findRegisteredCustomer(db, inbound.fromEmail);
  const detected = detectLangFromText(inbound.text);
  if (!customer) {
    console.log(
      '[supportAgent] unauthorized sender domain=',
      inbound.fromEmail.split('@')[1] || ''
    );
    await sendUnauthorizedNotice(inbound.fromEmail, detected);
    return { ok: true, authorized: false };
  }

  const locale = customer.locale || detected;

  // Follow-up on open ticket → bump attempts / escalate at 2
  try {
    const existing = await maybeEscalateExistingThread(db, {
      ...inbound,
      fromEmail: customer.email,
    });
    if (existing && existing.status === 'escalated') {
      await notifyAdmin({
        ...existing,
        inboundText: inbound.text,
        draftReply: existing.draftReply || SYSTEM_COPY[locale].humanRequired,
      });
      await sendAckToCustomer(customer.email, locale, {
        messageId: inbound.messageId,
        references: inbound.references,
      });
      return { ok: true, authorized: true, ticketId: existing.id, status: 'escalated' };
    }
  } catch (err) {
    console.warn('[supportAgent] thread escalate check failed', err && err.message);
  }

  const escalateForced = needsHumanEscalation(inbound.text);

  const ticketRef = db.collection(COLLECTION).doc();
  const baseTicket = {
    id: ticketRef.id,
    customerEmail: customer.email,
    customerName: customer.fullName,
    uid: customer.uid,
    plan: customer.plan,
    planStatus: customer.planStatus,
    locale,
    subject: inbound.subject,
    inboundText: inbound.text.slice(0, 8000),
    inboundMessageId: inbound.messageId || null,
    inboundInReplyTo: inbound.inReplyTo || null,
    inboundReferences: inbound.references || null,
    resendEmailId: inbound.emailId || null,
    aiAttempts: 0,
    status: 'received',
    labels: [],
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };

  // Immediate ack (does not replace human-approved answer)
  try {
    await sendAckToCustomer(customer.email, locale, {
      messageId: inbound.messageId,
      references: inbound.references,
    });
  } catch (err) {
    console.error('[supportAgent] ack failed', err && err.message);
  }

  let draft = fallbackDraft({
    locale,
    message: inbound.text,
    escalate: escalateForced,
  });

  if (!escalateForced) {
    const prompt = buildPolicyPrompt({
      locale,
      customer,
      message: inbound.text,
      subject: inbound.subject,
    });
    const ai = await callOpenAiDraft(prompt);
    if (ai && ai.reply) {
      draft = {
        action: ai.action === 'escalate' ? 'escalate' : 'draft',
        confidence: Number(ai.confidence) || 0.5,
        reply: String(ai.reply),
        reason: String(ai.reason || 'openai'),
      };
    }
  }

  const aiAttempts = 1;
  let status = 'draft_pending_approval';
  const labels = [];

  if (draft.action === 'escalate' || escalateForced || (draft.confidence || 0) < 0.4) {
    status = 'escalated';
    labels.push('Human Review Required');
  }
  if (aiAttempts >= MAX_AI_ATTEMPTS && draft.action !== 'draft') {
    status = 'escalated';
    if (!labels.includes('Human Review Required')) labels.push('Human Review Required');
  }

  const ticket = {
    ...baseTicket,
    aiAttempts,
    status,
    labels,
    draftReply: draft.reply,
    draftReason: draft.reason,
    draftConfidence: draft.confidence,
    draftAction: draft.action,
  };

  await ticketRef.set(ticket);
  console.log(
    '[supportAgent] ticket created',
    JSON.stringify({
      id: ticketRef.id,
      status,
      locale,
      plan: customer.plan || null,
      attempts: aiAttempts,
    })
  );

  await notifyAdmin({ ...ticket, id: ticketRef.id });
  return { ok: true, authorized: true, ticketId: ticketRef.id, status };
}

/**
 * Second inbound on same thread increments attempts; escalate at 2.
 */
async function maybeEscalateExistingThread(db, inbound) {
  const email = String(inbound.fromEmail || '').toLowerCase();
  if (!email) return null;
  const q = await db.collection(COLLECTION).where('customerEmail', '==', email).limit(20).get();
  if (q.empty) return null;

  const open = q.docs.filter((d) => {
    const st = String((d.data() || {}).status || '');
    return ['draft_pending_approval', 'escalated', 'received'].includes(st);
  });
  if (!open.length) return null;

  let best = open[0];
  for (const d of open) {
    const a =
      best.data().createdAt && best.data().createdAt.toMillis
        ? best.data().createdAt.toMillis()
        : 0;
    const b = d.data().createdAt && d.data().createdAt.toMillis ? d.data().createdAt.toMillis() : 0;
    if (b > a) best = d;
  }
  const data = best.data() || {};
  const attempts = Number(data.aiAttempts || 0) + 1;
  const patch = {
    aiAttempts: attempts,
    updatedAt: FieldValue.serverTimestamp(),
    lastInboundText: String(inbound.text || '').slice(0, 4000),
  };
  if (attempts >= MAX_AI_ATTEMPTS || needsHumanEscalation(inbound.text)) {
    patch.status = 'escalated';
    patch.labels = Array.from(new Set([...(data.labels || []), 'Human Review Required']));
  }
  await best.ref.set(patch, { merge: true });
  return { id: best.id, ...data, ...patch };
}

async function decideSupportTicket(db, ticketId, decision, editedBody) {
  const ref = db.collection(COLLECTION).doc(String(ticketId));
  const snap = await ref.get();
  if (!snap.exists) {
    const err = new Error('Ticket not found');
    err.statusCode = 404;
    throw err;
  }
  const ticket = { id: snap.id, ...(snap.data() || {}) };
  const dec = String(decision || '').toLowerCase();

  if (dec === 'reject') {
    await ref.set(
      {
        status: 'rejected',
        updatedAt: FieldValue.serverTimestamp(),
        reviewedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    return { id: ticket.id, status: 'rejected' };
  }

  if (dec !== 'approve' && dec !== 'edit') {
    const err = new Error('decision must be approve|edit|reject');
    err.statusCode = 400;
    throw err;
  }

  const body =
    dec === 'edit' ? String(editedBody || '').trim() : String(ticket.draftReply || '').trim();
  if (!body) {
    const err = new Error('No reply body to send');
    err.statusCode = 400;
    throw err;
  }

  const threadHeaders = {};
  if (ticket.inboundMessageId) {
    threadHeaders['In-Reply-To'] = ticket.inboundMessageId;
    threadHeaders.References = ticket.inboundReferences
      ? `${ticket.inboundReferences} ${ticket.inboundMessageId}`
      : ticket.inboundMessageId;
  }

  const subject =
    ticket.subject && /^re:/i.test(ticket.subject)
      ? ticket.subject
      : `Re: ${ticket.subject || 'Resumora Support'}`;

  const sent = await sendTransactionalEmail({
    to: ticket.customerEmail,
    subject,
    text: body,
    from: process.env.SUPPORT_EMAIL_FROM || `Resumora Support <${SUPPORT_INBOX}>`,
    headers: Object.keys(threadHeaders).length ? threadHeaders : undefined,
    tags: [{ name: 'category', value: 'support_reply' }],
  });

  if (!sent.ok) {
    const err = new Error('Failed to send support reply');
    err.statusCode = 502;
    throw err;
  }

  await ref.set(
    {
      status: 'sent',
      finalReply: body,
      outboundMessageId: sent.id || null,
      sentAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      reviewedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  return { id: ticket.id, status: 'sent', outboundId: sent.id || null };
}

async function listSupportTickets(db, statusFilter) {
  let snap;
  if (statusFilter) {
    snap = await db.collection(COLLECTION).where('status', '==', statusFilter).limit(50).get();
  } else {
    snap = await db.collection(COLLECTION).limit(50).get();
  }
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }));
}

function verifyResendWebhookSecret(req) {
  const expected = String(process.env.RESEND_WEBHOOK_SECRET || '').trim();
  if (!expected) return true; // allow if not configured (ops must set in prod)
  const provided =
    req.get('svix-signature') ||
    req.get('resend-signature') ||
    req.get('x-resend-secret') ||
    req.get('x-webhook-secret') ||
    '';
  // Simple shared-secret header fallback (Svix signing can be added later)
  if (!provided) return false;
  try {
    const a = Buffer.from(String(provided));
    const b = Buffer.from(expected);
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch (_) {
    return false;
  }
}

module.exports = {
  COLLECTION,
  POLICIES,
  SYSTEM_COPY,
  handleInboundSupportEmail,
  decideSupportTicket,
  listSupportTickets,
  verifyResendWebhookSecret,
  maybeEscalateExistingThread,
  extractInboundPayload,
  findRegisteredCustomer,
};
