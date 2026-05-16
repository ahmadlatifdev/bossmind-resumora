/**
 * Gemini Enhancement Layer — semantic SEO refinement for outlines (optional).
 */
async function runGeminiSeoEnhance({ contentJson }) {
  const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  const model = process.env.GEMINI_SEO_MODEL || "gemini-2.0-flash";
  const out = { generatedAt: new Date().toISOString(), aiUsed: false, refinements: null };

  if (!key) {
    out.note = "GEMINI_API_KEY or GOOGLE_GENERATIVE_AI_API_KEY unset";
    return out;
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`;
  const prompt = `Refine this SEO content bundle for Google search intent, featured snippets, and readability.
Return JSON: { semanticKeywords: [], snippetCandidates: [], structureTips: [], readabilityScore: number }.
Input: ${JSON.stringify(contentJson).slice(0, 12000)}`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 1024 },
      }),
    });
    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
    if (!text) {
      out.aiError = data.error?.message || "empty_gemini_response";
      return out;
    }
    const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
    out.refinements = JSON.parse(cleaned.match(/\{[\s\S]*\}/)?.[0] || cleaned);
    out.aiUsed = true;
  } catch (e) {
    out.aiError = e.message || String(e);
  }

  return out;
}

module.exports = { runGeminiSeoEnhance };
