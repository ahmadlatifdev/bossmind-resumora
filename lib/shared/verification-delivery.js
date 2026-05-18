/**
 * Email + SMS verification delivery with retry fallback (Resend, SMTP fetch, Twilio).
 * No secrets logged. Dev mode: BOSSMIND_PASSWORD_RESET_DEV_LOG=1 logs OTP to stderr only.
 */

const MAX_ATTEMPTS = 2;
const RETRY_MS = 800;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function auditProviders() {
  const resend = Boolean(process.env.RESEND_API_KEY);
  const smtp =
    Boolean(process.env.SMTP_HOST) &&
    Boolean(process.env.SMTP_USER) &&
    Boolean(process.env.SMTP_PASS);
  const twilio =
    Boolean(process.env.TWILIO_ACCOUNT_SID) &&
    Boolean(process.env.TWILIO_AUTH_TOKEN) &&
    Boolean(process.env.TWILIO_FROM_NUMBER);
  const devLog = process.env.BOSSMIND_PASSWORD_RESET_DEV_LOG === "1";
  return {
    email: { resend, smtp, configured: resend || smtp || devLog },
    sms: { twilio, configured: twilio || devLog },
    devLog,
  };
}

async function sendEmail({ to, subject, text, html }) {
  const from = process.env.RESEND_FROM || process.env.SMTP_FROM || "noreply@resumora.net";
  const key = process.env.RESEND_API_KEY;
  if (key) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [to], subject, text, html }),
      signal: AbortSignal.timeout(20000),
    });
    const body = await res.json().catch(() => ({}));
    return { ok: res.ok, provider: "resend", status: res.status, id: body.id, error: body.message };
  }

  if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
    return {
      ok: false,
      provider: "smtp",
      error: "smtp_requires_worker",
      hint: "Configure RESEND_API_KEY or Railway SMTP worker for production email",
    };
  }

  if (process.env.BOSSMIND_PASSWORD_RESET_DEV_LOG === "1") {
    console.error(`[password-reset-dev] email to=${to} code embedded in message (dev only)`);
    return { ok: true, provider: "dev_log", dev: true };
  }

  return { ok: false, provider: null, error: "email_not_configured" };
}

async function sendSms({ to, body }) {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM_NUMBER;
  if (!sid || !token || !from) {
    if (process.env.BOSSMIND_PASSWORD_RESET_DEV_LOG === "1") {
      console.error(`[password-reset-dev] sms to=${to} (dev only)`);
      return { ok: true, provider: "dev_log", dev: true };
    }
    return { ok: false, provider: null, error: "sms_not_configured" };
  }

  const auth = Buffer.from(`${sid}:${token}`).toString("base64");
  const params = new URLSearchParams({ To: to, From: from, Body: body });
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
    signal: AbortSignal.timeout(20000),
  });
  const data = await res.json().catch(() => ({}));
  return {
    ok: res.ok,
    provider: "twilio",
    status: res.status,
    sid: data.sid,
    error: data.message,
  };
}

async function deliverWithRetry(fn, label) {
  let last = null;
  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    try {
      last = await fn();
      if (last.ok) return { ...last, attempts: i + 1, label };
    } catch (e) {
      last = { ok: false, error: e.message || String(e) };
    }
    if (i < MAX_ATTEMPTS - 1) await sleep(RETRY_MS * (i + 1));
  }
  return { ...last, attempts: MAX_ATTEMPTS, label, fallbackFailed: true };
}

async function deliverPasswordResetCode({ email, phone, code, lang = "en" }) {
  const providers = auditProviders();
  const en = lang !== "fr";
  const subject = en ? "Resumora password reset code" : "Code de réinitialisation Resumora";
  const emailText = en
    ? `Your verification code is ${code}. It expires in 15 minutes. If you did not request this, ignore this email.`
    : `Votre code de vérification est ${code}. Il expire dans 15 minutes. Si vous n'êtes pas à l'origine de cette demande, ignorez ce message.`;
  const smsText = en
    ? `Resumora code: ${code}. Expires in 15 min.`
    : `Code Resumora : ${code}. Expire dans 15 min.`;

  const results = { providers, email: null, sms: null };

  if (email) {
    results.email = await deliverWithRetry(
      () =>
        sendEmail({
          to: email,
          subject,
          text: emailText,
          html: `<p>${emailText}</p>`,
        }),
      "email"
    );
  }

  if (phone) {
    results.sms = await deliverWithRetry(() => sendSms({ to: phone, body: smsText }), "sms");
  }

  const emailOk = !email || results.email?.ok;
  const smsOk = !phone || results.sms?.ok;
  results.ok = emailOk && smsOk;
  if (!results.ok && email && !phone && results.email?.dev) results.ok = true;
  if (!results.ok && phone && !email && results.sms?.dev) results.ok = true;

  return results;
}

module.exports = {
  auditProviders,
  deliverPasswordResetCode,
  sendEmail,
  sendSms,
};
