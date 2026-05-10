/**
 * DeepSeek OpenAI-compatible API.
 * V3: deepseek-chat   ·   R1: deepseek-reasoner
 * @see https://api.deepseek.com
 */

const DEEPSEEK_BASE = process.env.DEEPSEEK_API_BASE || "https://api.deepseek.com";
const CHAT_PATH = "/v1/chat/completions";

const MODELS = {
  v3: process.env.DEEPSEEK_MODEL_V3 || "deepseek-chat",
  r1: process.env.DEEPSEEK_MODEL_R1 || "deepseek-reasoner",
};

function getKey() {
  return process.env.DEEPSEEK_API_KEY || "";
}

/**
 * @param {{ model: string, messages: { role: string, content: string }[], maxTokens?: number, temperature?: number }} opts
 */
async function chatCompletions({ model, messages, maxTokens = 512, temperature = 0.6 }) {
  const key = getKey();
  if (!key) {
    return { ok: false, error: "DEEPSEEK_API_KEY is not set", text: "" };
  }
  const res = await fetch(`${DEEPSEEK_BASE.replace(/\/$/, "")}${CHAT_PATH}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model,
      messages,
      max_tokens: maxTokens,
      temperature,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return {
      ok: false,
      error: data?.error?.message || res.statusText || "DeepSeek request failed",
      text: "",
      status: res.status,
    };
  }
  const text = data?.choices?.[0]?.message?.content || "";
  return { ok: true, text, raw: data };
}

/** Lightweight connectivity + model reachability (minimal tokens). */
async function probeModel(model) {
  const r = await chatCompletions({
    model,
    messages: [{ role: "user", content: "Reply with one word: ok" }],
    maxTokens: 4,
    temperature: 0,
  });
  return {
    model,
    reachable: r.ok,
    sample: r.text?.slice(0, 80) || "",
    error: r.ok ? "" : r.error,
  };
}

/**
 * @returns {Promise<{
 *   apiKeyPresent: boolean,
 *   baseUrl: string,
 *   models: { v3: object, r1: object },
 *   listModelsOk?: boolean
 * }>}
 */
async function getDeepSeekIntegrationStatus() {
  const apiKeyPresent = Boolean(getKey());
  const baseUrl = DEEPSEEK_BASE;
  if (!apiKeyPresent) {
    return {
      apiKeyPresent: false,
      baseUrl,
      models: {
        v3: { model: MODELS.v3, reachable: false, note: "Set DEEPSEEK_API_KEY" },
        r1: { model: MODELS.r1, reachable: false, note: "Set DEEPSEEK_API_KEY" },
      },
    };
  }

  let listModelsOk = false;
  try {
    const lr = await fetch(`${DEEPSEEK_BASE.replace(/\/$/, "")}/v1/models`, {
      headers: { Authorization: `Bearer ${getKey()}` },
    });
    listModelsOk = lr.ok;
  } catch {
    listModelsOk = false;
  }

  const [v3, r1] = await Promise.all([probeModel(MODELS.v3), probeModel(MODELS.r1)]);

  return {
    apiKeyPresent: true,
    baseUrl,
    listModelsOk,
    models: {
      v3: { label: "DeepSeek V3 (chat)", ...v3 },
      r1: { label: "DeepSeek R1 (reasoner)", ...r1 },
    },
  };
}

module.exports = {
  chatCompletions,
  getDeepSeekIntegrationStatus,
  getKey,
  MODELS,
};
