/**
 * OpenAI Content Layer — weekly organic drafts (blog, social, FAQ, CTAs). Env: OPENAI_API_KEY.
 */
const { getSiteUrl } = require("./seo-config");

async function runOpenAiContentLayer({ weekId, dayTheme = "general" } = {}) {
  const key = process.env.OPENAI_API_KEY;
  const siteUrl = getSiteUrl();
  const out = {
    generatedAt: new Date().toISOString(),
    weekId,
    dayTheme,
    siteUrl,
    aiUsed: false,
    blogPosts: [],
    linkedinPosts: [],
    instagramCaptions: [],
    pinterestText: [],
    youtubeDescriptions: [],
    faqSections: [],
    ctaVariants: [],
  };

  if (!key) {
    out.note = "OPENAI_API_KEY unset";
    return out;
  }

  const model = process.env.OPENAI_CONTENT_MODEL || "gpt-4o-mini";
  const prompt = `Generate organic marketing JSON for Resumora (${siteUrl}), week ${weekId}, theme ${dayTheme}.
Keys: blogPosts (2 items {title, outline}), linkedinPosts (2), instagramCaptions (2), pinterestText (2),
youtubeDescriptions (1), faqSections (3 Q&A), ctaVariants (3). Luxury professional tone. No paid ads. JSON only.`;

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: "Return valid JSON only." },
        { role: "user", content: prompt },
      ],
      temperature: 0.55,
    }),
  });

  const raw = await res.text();
  if (!res.ok) {
    out.aiError = raw.slice(0, 500);
    return out;
  }

  try {
    const data = JSON.parse(raw);
    const content = data.choices?.[0]?.message?.content || "";
    const cleaned = content.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
    const j = JSON.parse(cleaned.match(/\{[\s\S]*\}/)?.[0] || cleaned);
    Object.assign(out, j, { aiUsed: true, generatedAt: new Date().toISOString() });
  } catch (e) {
    out.aiError = e.message || String(e);
  }

  return out;
}

module.exports = { runOpenAiContentLayer };
