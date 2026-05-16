/**
 * External AI/media providers for BossMind AI Video (env-driven; never hardcode keys).
 */
const DEFAULT_DEEPSEEK_BASE = "https://api.deepseek.com";

async function deepseekScenarioFromScript({ scriptText, language = "en", channelName: channelLabel }) {
  const key = process.env.DEEPSEEK_API_KEY;
  if (!key) {
    throw new Error("DEEPSEEK_API_KEY is required for scenario generation");
  }
  const base = (process.env.DEEPSEEK_API_BASE || DEFAULT_DEEPSEEK_BASE).replace(/\/$/, "");
  const model = process.env.DEEPSEEK_MODEL || "deepseek-chat";
  const url = base.includes("/v1") ? `${base}/chat/completions` : `${base}/chat/completions`;

  const brand = (channelLabel || require("./bossmind-ai-video-store.js").channelName()).trim();

  const sys = `You are a video director for the "${brand}" channel. Output ONE JSON object only, no markdown, with keys:
title (string), scenes (array of { index, prompt, durationSec, visualStyle }).
Language context for VO/captions: ${language}.
Keep tone and visuals consistent with the ${brand} brand; use the brand name only where it fits naturally in titles or VO.
Script / idea:
${scriptText.slice(0, 120_000)}`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: "Return only valid JSON." },
        { role: "user", content: sys },
      ],
      temperature: 0.35,
    }),
  });

  const raw = await res.text();
  if (!res.ok) {
    throw new Error(`DeepSeek HTTP ${res.status}: ${raw.slice(0, 500)}`);
  }
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error(`DeepSeek invalid JSON: ${raw.slice(0, 200)}`);
  }
  const content = data.choices?.[0]?.message?.content || "";
  const cleaned = String(content).replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  let structured;
  try {
    structured = JSON.parse(cleaned);
  } catch {
    const m = cleaned.match(/\{[\s\S]*\}/);
    if (!m) throw new Error(`DeepSeek returned non-JSON: ${cleaned.slice(0, 400)}`);
    structured = JSON.parse(m[0]);
  }
  if (!structured.scenes || !Array.isArray(structured.scenes)) {
    structured.scenes = structured.sceneList || structured.scenes || [];
  }
  if (structured.scenes.length === 0) {
    throw new Error("DeepSeek JSON missing scenes array");
  }
  return { model, structured, rawUsage: data.usage || null };
}

async function openAiSpeechTts({ text, outPath }) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY is required for TTS");
  const fs = require("fs");
  const res = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.OPENAI_TTS_MODEL || "tts-1",
      voice: process.env.OPENAI_TTS_VOICE || "alloy",
      input: text.slice(0, 4096),
    }),
  });
  if (!res.ok) {
    throw new Error(`OpenAI TTS ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(outPath, buf);
  return { bytes: buf.length, path: outPath };
}

async function openAiWhisperTranscribe({ audioPath }) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY is required for Whisper");
  const fs = require("fs");
  const buf = fs.readFileSync(audioPath);
  const form = new FormData();
  form.append("file", new Blob([buf]), "audio.mp3");
  form.append("model", process.env.OPENAI_WHISPER_MODEL || "whisper-1");

  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}` },
    body: form,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Whisper ${res.status}: ${text.slice(0, 400)}`);
  const j = JSON.parse(text);
  return { text: j.text || "" };
}

/**
 * Delegate scene media to n8n or custom worker — POST JSON, expect { assetUrl, mime? }.
 */
async function requestSceneMediaFromWebhook({ scene, prompt, providerHint }) {
  const url = process.env.BOSSMIND_AI_VIDEO_SCENE_WEBHOOK_URL;
  const secret = process.env.BOSSMIND_AI_VIDEO_SCENE_WEBHOOK_SECRET;
  if (!url || !secret) {
    throw new Error("BOSSMIND_AI_VIDEO_SCENE_WEBHOOK_URL and BOSSMIND_AI_VIDEO_SCENE_WEBHOOK_SECRET are required for scene media");
  }
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${secret}`,
    },
    body: JSON.stringify({
      sceneId: scene.id,
      sceneIndex: scene.scene_index,
      prompt,
      providerHint: providerHint || scene.provider || null,
    }),
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`Scene webhook ${res.status}: ${body.slice(0, 400)}`);
  const j = JSON.parse(body);
  if (!j.assetUrl) throw new Error("Scene webhook must return JSON { assetUrl }");
  return { assetUrl: j.assetUrl, mime: j.mime || "video/mp4", meta: j.meta || {} };
}

async function requestPublishFromWebhook({ platform, renderId, manifest }) {
  const url = process.env.BOSSMIND_AI_VIDEO_PUBLISH_WEBHOOK_URL;
  const secret = process.env.BOSSMIND_AI_VIDEO_PUBLISH_WEBHOOK_SECRET;
  if (!url || !secret) {
    throw new Error("BOSSMIND_AI_VIDEO_PUBLISH_WEBHOOK_URL and BOSSMIND_AI_VIDEO_PUBLISH_WEBHOOK_SECRET required to publish");
  }
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${secret}`,
    },
    body: JSON.stringify({ platform, renderId, manifest }),
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`Publish webhook ${res.status}: ${body.slice(0, 400)}`);
  const j = JSON.parse(body);
  return { publishedUrl: j.publishedUrl || j.url || null, meta: j.meta || {} };
}

module.exports = {
  deepseekScenarioFromScript,
  openAiSpeechTts,
  openAiWhisperTranscribe,
  requestSceneMediaFromWebhook,
  requestPublishFromWebhook,
};
