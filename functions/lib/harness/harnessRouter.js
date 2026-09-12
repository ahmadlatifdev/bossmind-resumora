const adminHarness = require('./adminHarness');
const clientHarness = require('./clientHarness');

const SECRET_PATTERNS = [/api[_-]?key/i, /secret/i, /password/i];

function redact(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(redact);
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (
      SECRET_PATTERNS.some(function (p) {
        return p.test(k);
      })
    )
      out[k] = '[REDACTED]';
    else out[k] = v && typeof v === 'object' ? redact(v) : v;
  }
  return out;
}

async function route({ mode, sessionId, message, history, headers }) {
  if (mode === 'admin') {
    const pw = headers && (headers['x-admin-password'] || headers['X-Admin-Password']);
    if (!pw || pw !== process.env.ADMIN_HEAL_PW) {
      const err = new Error('Forbidden');
      err.status = 403;
      throw err;
    }
    const result = await adminHarness.handle({ sessionId, message, history });
    return redact(result);
  }
  if (mode === 'client') {
    const result = await clientHarness.handle({ sessionId, message, history });
    return redact(result);
  }
  const err = new Error('Invalid mode');
  err.status = 400;
  throw err;
}

module.exports = { route, redact };
