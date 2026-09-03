/**
 * Lightweight Gemini fallback for Client Chat when Hermes is unreachable.
 * Never logs API key values. Do not mention model names in user-facing text.
 */
const LANG_LABEL = { en: 'English', fr: 'French', es: 'Spanish' };

function geminiApiKey() {
  return String(
    process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY || process.env.GOOGLE_API_KEY || ''
  ).trim();
}

/**
 * @param {{ prompt: string, lang?: string, context?: string, timeoutMs?: number }} opts
 */
async function callGeminiChat({ prompt, lang, context, timeoutMs }) {
  const apiKey = geminiApiKey();
  if (!apiKey) {
    const err = new Error('Gemini API key is not configured');
    err.code = 'gemini_not_configured';
    throw err;
  }
  const code = LANG_LABEL[String(lang || 'en').slice(0, 2)] ? String(lang).slice(0, 2) : 'en';
  const model = process.env.GEMINI_CHAT_MODEL || process.env.GEMINI_MODEL || 'gemini-2.0-flash';
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs || 20000);
  const textPrompt = [
    'You are the Resumora support assistant for resumora.net (plans $29 / $49 / $79 / $110).',
    `Reply only in ${LANG_LABEL[code]}. Do not name models or vendors.`,
    'Do not ask for passwords, full card numbers, or secret keys.',
    context ? `Context:\n${String(context).slice(0, 3000)}` : '',
    `User:\n${String(prompt || '').slice(0, 4000)}`,
  ]
    .filter(Boolean)
    .join('\n\n');

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: ctrl.signal,
        body: JSON.stringify({
          contents: [{ parts: [{ text: textPrompt }] }],
          generationConfig: { temperature: 0.3, maxOutputTokens: 1024 },
        }),
      }
    );
    if (!res.ok) {
      const err = new Error(`Gemini HTTP ${res.status}`);
      err.code = `gemini_http_${res.status}`;
      throw err;
    }
    const json = await res.json();
    const text = String(json?.candidates?.[0]?.content?.parts?.[0]?.text || '').trim();
    if (!text) {
      const err = new Error('Gemini returned an empty reply');
      err.code = 'gemini_empty';
      throw err;
    }
    return { text };
  } catch (err) {
    if (err && err.name === 'AbortError') {
      err.code = 'gemini_timeout';
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

module.exports = {
  geminiApiKeyConfigured: () => Boolean(geminiApiKey()),
  callGeminiChat,
};
