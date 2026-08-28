/**
 * Shared transactional email via Resend.
 * Prefer RESEND_API_KEY; EMAIL_API_KEY accepted as alias.
 * Never logs API key values.
 */
async function sendTransactionalEmail({
  to,
  subject,
  text,
  html,
  tags,
  from: fromOverride,
  headers,
  replyTo,
}) {
  const apiKey = String(process.env.RESEND_API_KEY || process.env.EMAIL_API_KEY || '').trim();
  const from =
    String(
      fromOverride ||
        process.env.SUPPORT_EMAIL_FROM ||
        process.env.INVOICE_EMAIL_FROM ||
        process.env.REFUND_EMAIL_FROM ||
        process.env.EMAIL_FROM ||
        ''
    ).trim() || 'Resumora <onboarding@resend.dev>';

  if (!apiKey) {
    console.log(
      '[mail] skipped — RESEND_API_KEY / EMAIL_API_KEY not configured',
      JSON.stringify({ hasTo: Boolean(to), subject: Boolean(subject) })
    );
    return { skipped: true, reason: 'missing_api_key' };
  }
  if (!to) {
    console.log('[mail] skipped — missing recipient', JSON.stringify({ subject }));
    return { skipped: true, reason: 'missing_recipient' };
  }

  const payload = {
    from,
    to: Array.isArray(to) ? to : [to],
    subject,
    text,
    html: html || undefined,
    tags: tags || undefined,
    reply_to: replyTo || undefined,
    headers: headers && typeof headers === 'object' ? headers : undefined,
  };

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const body = await res.text();
    console.error('[mail] send failed', res.status, body.slice(0, 240));
    return { ok: false, status: res.status };
  }

  let id = null;
  try {
    const json = await res.json();
    id = json && json.id ? String(json.id) : null;
  } catch (_) {
    /* ignore */
  }
  console.log(
    '[mail] sent ok',
    JSON.stringify({ toDomain: String(Array.isArray(to) ? to[0] : to).split('@')[1] || '', id })
  );
  return { ok: true, id };
}

function emailProviderConfigured() {
  return Boolean(String(process.env.RESEND_API_KEY || process.env.EMAIL_API_KEY || '').trim());
}

module.exports = {
  sendTransactionalEmail,
  emailProviderConfigured,
};
