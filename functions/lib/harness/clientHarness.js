const admin = require('firebase-admin');
const tools = require('./harnessTools');

const CLIENT_TOOLS = [
  'searchDocs',
  'getFaq',
  'explainFeature',
  'checkOrderStatus',
  'createSupportTicket',
];
const RATE_LIMIT = 20;
const WINDOW_MS = 60 * 60 * 1000;

async function checkRateLimit(sessionId) {
  const db = admin.firestore();
  const ref = db.collection('harness_rate_limits').doc(sessionId);
  const snap = await ref.get();
  const now = Date.now();
  let timestamps = (snap.exists && snap.data().timestamps) || [];
  timestamps = timestamps.filter(function (t) {
    return now - t < WINDOW_MS;
  });
  if (timestamps.length >= RATE_LIMIT) return false;
  timestamps.push(now);
  await ref.set({ timestamps: timestamps }, { merge: true });
  return true;
}

async function callGemini(message) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return { reply: 'AI key not configured.', toolCalls: [], needs_human: true };
  const url =
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=' +
    key;
  const prompt =
    'You are BossMind Client Support. READ-ONLY tools only: ' +
    CLIENT_TOOLS.join(', ') +
    '. NEVER perform admin actions. Reply with ONLY valid JSON (no markdown, no backticks). The JSON MUST use the key "reply" for the text response. Example: {"reply": "your answer here"}, "toolCalls": [{"tool": string, "args": object}], "needs_human": boolean}. User: ' +
    message;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }] }),
  });
  const data = await res.json();
  const text =
    (data &&
      data.candidates &&
      data.candidates[0] &&
      data.candidates[0].content &&
      data.candidates[0].content.parts &&
      data.candidates[0].content.parts[0] &&
      data.candidates[0].content.parts[0].text) ||
    '{}';
  try {
    return JSON.parse(text);
  } catch (e) {
    return { reply: text, toolCalls: [], needs_human: true };
  }
}

async function handle({ sessionId, message, history }) {
  const allowed = await checkRateLimit(sessionId);
  if (!allowed)
    return { reply: 'Rate limit reached. Try again later.', toolResults: [], needs_human: true };
  const ai = await callGemini(message);
  const results = [];
  const calls = ai.toolCalls || [];
  for (const call of calls) {
    const toolName = call.tool;
    if (CLIENT_TOOLS.indexOf(toolName) === -1) {
      results.push({ tool: toolName, error: 'not allowed' });
      continue;
    }
    try {
      const out = await tools[toolName](call.args || {}, 'client');
      results.push({ tool: toolName, ok: true, out: out });
    } catch (e) {
      results.push({ tool: toolName, ok: false, error: e.message });
    }
  }
  return { reply: ai.reply, toolResults: results, needs_human: !!ai.needs_human };
}

module.exports = { handle, CLIENT_TOOLS };
