const AUTH_RE = /\b(auth|authentication|firebase.?auth|password.?reset|session|oauth|jwt)\b/i;
const PAY_RE = /\b(stripe|payment|checkout|webhook|billing|refund.?gateway|price_)\b/i;
const SCHEMA_RE =
  /\b(schema|migration|ddl|alter\s+table|neon|postgres|firestore.?rules|database)\b/i;
const SECRET_RE = /\b(secret|api.?key|sk_live|whsec|service.?account)\b/i;
const CRITICAL_PATH_HINTS = [
  /src\/auth\//i,
  /functions\/.*stripe/i,
  /createCheckoutSession/i,
  /stripeWebhook/i,
  /\.env/i,
];
export function detectRiskFlags(idea) {
  const blob = `${idea.title}\n${idea.description}\n${idea.tags.join(' ')}\n${idea.requestedFiles.join(' ')}`;
  const flags = [];
  if (AUTH_RE.test(blob) || idea.tags.some((t) => /auth|security/i.test(t))) flags.push('auth');
  if (PAY_RE.test(blob) || idea.tags.some((t) => /payment|stripe|billing/i.test(t)))
    flags.push('payments');
  if (SCHEMA_RE.test(blob) || idea.tags.some((t) => /schema|database|neon/i.test(t)))
    flags.push('database_schema');
  if (SECRET_RE.test(blob)) flags.push('secrets');
  if (CRITICAL_PATH_HINTS.some((re) => idea.requestedFiles.some((f) => re.test(f)))) {
    if (!flags.includes('auth') && /auth/i.test(idea.requestedFiles.join(' '))) flags.push('auth');
    if (!flags.includes('payments') && /stripe|checkout/i.test(idea.requestedFiles.join(' ')))
      flags.push('payments');
  }
  return [...new Set(flags)];
}
export function isAutoExecutable(idea) {
  if (idea.requiresHitl && idea.status === 'awaiting_hitl') return false;
  if (idea.status === 'rejected' || idea.status === 'failed') return false;
  return idea.status === 'triaged' || idea.status === 'queued' || idea.status === 'approved';
}
