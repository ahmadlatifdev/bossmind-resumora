/**
 * Policy-driven Client Chat: FAQ first; Hermes for complex queries.
 * Dual-tier fallback:
 *   - Hermes timeout / rate_limit → FAQ policy
 *   - Hermes unreachable / not_configured → Gemini (if configured) → FAQ
 * Never logs secret values. Do not mention model names in user-facing text.
 */
const fs = require('fs');
const path = require('path');
const { resolveFaqReply, normalizeLang } = require('./supportResponses');
const hermes = require('./hermesClient');
const { callGeminiChat } = require('./geminiChat');

const POLICY_PATH = path.join(__dirname, '..', 'support_policy.md');

let policyCache = null;

function loadPolicyText() {
  if (policyCache) return policyCache;
  try {
    policyCache = fs.readFileSync(POLICY_PATH, 'utf8');
  } catch {
    policyCache = '';
  }
  return policyCache;
}

function isComplexQuery(faq, message) {
  const text = String(message || '');
  if (faq.escalate || faq.intent === 'fallback' || faq.intent === 'human') return true;
  if (text.length >= 160) return true;
  if ((text.match(/\?/g) || []).length >= 2) return true;
  return false;
}

function isUnreachable(code) {
  return (
    ['not_configured', 'unreachable', 'empty'].includes(String(code || '')) ||
    /^http_5\d\d$/.test(String(code || ''))
  );
}

function isTimeoutOrBusy(code) {
  return (
    ['timeout', 'rate_limited'].includes(String(code || '')) ||
    /^http_429$/.test(String(code || ''))
  );
}

function policyResult(faq) {
  return {
    intent: faq.intent,
    responseKey: faq.responseKey,
    reply: faq.reply,
    followup: faq.followup,
    escalate: faq.escalate,
    engine: 'policy',
  };
}

/**
 * @param {{ message: string, lang?: string, intentHint?: string, db?: FirebaseFirestore.Firestore }} opts
 */
async function resolveChatReply({ message, lang, intentHint, db }) {
  loadPolicyText();
  const faq = resolveFaqReply({ message, lang, intentHint });
  const code = normalizeLang(lang);
  const context = `Matched FAQ intent: ${faq.intent}. Support: support@resumora.net.`;

  let useHermes = false;
  try {
    useHermes = isComplexQuery(faq, message) && (await hermes.isChatEnabled(db));
  } catch {
    useHermes = false;
  }

  if (useHermes) {
    try {
      const out = await hermes.callHermes({
        prompt: message,
        context,
        lang: code,
        timeoutMs: hermes.chatTimeoutMs(),
        db,
      });
      return {
        intent: faq.intent,
        responseKey: faq.responseKey,
        reply: out.text,
        followup: faq.followup,
        escalate: faq.escalate,
        engine: 'hermes',
      };
    } catch (err) {
      const errCode = err && err.code ? err.code : 'unreachable';
      if (isTimeoutOrBusy(errCode)) {
        return policyResult(faq);
      }
      if (isUnreachable(errCode)) {
        try {
          const gem = await callGeminiChat({
            prompt: message,
            lang: code,
            context,
            timeoutMs: 20000,
          });
          return {
            intent: faq.intent,
            responseKey: faq.responseKey,
            reply: gem.text,
            followup: faq.followup,
            escalate: faq.escalate,
            engine: 'gemini',
          };
        } catch {
          return policyResult(faq);
        }
      }
      return policyResult(faq);
    }
  }

  return policyResult(faq);
}

module.exports = {
  resolveChatReply,
  classifyIntent: (message, hinted) => resolveFaqReply({ message, intentHint: hinted }).intent,
  normalizeLang,
  t: (lang, intent) => resolveFaqReply({ message: intent, lang, intentHint: intent }).reply,
  isComplexQuery,
};
