/**
 * Gemini-backed video metadata enrichment (summary, chapters, tags, transcript draft).
 * Uses existing geminiChat transport (Vertex or GEMINI_API_KEY). No new npm packages.
 */
'use strict';

const { callGeminiChat, geminiApiKeyConfigured } = require('./geminiChat');

const ENRICH_PROMPT = `You enrich career-education video metadata for Resumora (resumora.net).
Return ONLY valid JSON (no markdown) with this exact shape:
{
  "transcript": "full or best-effort transcript text, or empty string if unknown",
  "summary": "exactly two sentences summarizing the video",
  "chapters": [{"timestamp": "MM:SS", "title": "short chapter title"}],
  "tags": ["skill-or-topic", "..."]
}
Rules:
- chapters: 5 to 10 items when possible; fewer if content is short
- tags: 10 to 15 relevant skills/topics, lowercase kebab-case preferred
- Do not invent brand names other than Resumora
- If only a title/seed is provided, still produce useful chapters as timed outline guesses and note uncertainty in summary`;

function stripJsonFence(text) {
  let t = String(text || '').trim();
  if (t.startsWith('```')) {
    t = t.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  }
  return t.trim();
}

function normalizeChapters(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .slice(0, 12)
    .map((c) => ({
      timestamp: String((c && c.timestamp) || '00:00').slice(0, 12),
      title: String((c && c.title) || 'Chapter').slice(0, 120),
    }))
    .filter((c) => c.title);
}

function normalizeTags(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  const seen = new Set();
  for (const t of raw) {
    const tag = String(t || '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '-')
      .slice(0, 64);
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    out.push(tag);
    if (out.length >= 15) break;
  }
  return out;
}

/**
 * @param {{ title?: string, seedText?: string, existingTranscript?: string, timeoutMs?: number }} opts
 */
async function generateVideoMetadata(opts = {}) {
  if (!geminiApiKeyConfigured()) {
    throw Object.assign(new Error('Gemini not configured for enrichment'), {
      code: 'gemini_not_configured',
      statusCode: 503,
    });
  }

  const title = String(opts.title || 'Untitled video').slice(0, 200);
  const seed = String(opts.seedText || '').slice(0, 4000);
  const existing = String(opts.existingTranscript || '').slice(0, 12000);

  const prompt = [
    ENRICH_PROMPT,
    `Title: ${title}`,
    seed ? `Seed / description:\n${seed}` : '',
    existing ? `Existing transcript (prefer refining this):\n${existing}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');

  // Bypass support-persona wrapper: call via callGeminiChat with the enrich prompt as user text.
  const { text, provider } = await callGeminiChat({
    prompt,
    lang: 'en',
    context: 'Task: video metadata JSON enrichment only. Ignore support-assistant style.',
    timeoutMs: opts.timeoutMs || 45000,
  });

  let parsed;
  try {
    parsed = JSON.parse(stripJsonFence(text));
  } catch {
    throw Object.assign(new Error('Enrichment model returned non-JSON'), {
      code: 'enrichment_bad_json',
      statusCode: 502,
    });
  }

  const transcript = String(parsed.transcript || existing || '').slice(0, 100000);
  const summary = String(parsed.summary || '').slice(0, 1000);
  const chapters = normalizeChapters(parsed.chapters);
  const tags = normalizeTags(parsed.tags);

  if (!summary && !tags.length) {
    throw Object.assign(new Error('Enrichment produced empty summary/tags'), {
      code: 'enrichment_empty',
      statusCode: 502,
    });
  }

  return {
    transcript,
    summary:
      summary ||
      `${title} covers practical career skills. Review the chapters and tags for the full outline.`,
    chapters,
    tags,
    provider: provider || 'gemini',
  };
}

module.exports = {
  generateVideoMetadata,
  geminiApiKeyConfigured,
};
