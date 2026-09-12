const { pending, final } = require('./harnessAudit');
const tools = require('./harnessTools');

const ADMIN_TOOLS = [
  'readFile',
  'writeFile',
  'runBuild',
  'deployHosting',
  'updateFirestore',
  'runHealthCycle',
  'regenerateManual',
];

async function callGemini(message) {
  const key = process.env.GOOGLE_AI_KEY;
  if (!key) return { reply: 'AI key not configured.', toolCalls: [], needs_human: false };
  const url =
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=' +
    key;
  const prompt =
    'You are the BossMind Admin Harness. Allowed tools: ' +
    ADMIN_TOOLS.join(', ') +
    '. Reply in JSON: {"reply": string, "toolCalls": [{"tool": string, "args": object}], "needs_human": boolean}. User: ' +
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
    return { reply: text, toolCalls: [], needs_human: false };
  }
}

async function handle({ sessionId, message, history }) {
  const ai = await callGemini(message);
  const results = [];
  const calls = ai.toolCalls || [];
  for (const call of calls) {
    const toolName = call.tool;
    if (ADMIN_TOOLS.indexOf(toolName) === -1) {
      results.push({ tool: toolName, error: 'not allowed' });
      continue;
    }
    const auditId = await pending(
      { tool: toolName, args: call.args, sessionId: sessionId },
      'admin'
    );
    try {
      const out = await tools[toolName](call.args || {}, 'admin');
      await final(auditId, { ok: true, out: out });
      results.push({ tool: toolName, ok: true, out: out });
    } catch (e) {
      await final(auditId, { ok: false, error: e.message });
      results.push({ tool: toolName, ok: false, error: e.message });
    }
  }
  return { reply: ai.reply, toolResults: results, needs_human: !!ai.needs_human };
}

module.exports = { handle, ADMIN_TOOLS };
