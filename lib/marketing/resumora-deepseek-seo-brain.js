/**
 * DeepSeek SEO Brain — strategy, keywords, competitor gaps, landing outlines (env-driven).
 */
const fs = require("fs");
const path = require("path");
const { chatCompletions, MODELS } = require("../ai/deepseek");
const { getSiteUrl } = require("./seo-config");

function loadEngineConfig(root = process.cwd()) {
  const p = path.join(root, "config/resumora-google-traffic-engine.json");
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return { seoExpansionTargets: [] };
  }
}

async function runDeepSeekSeoBrain({ weekId, root = process.cwd() } = {}) {
  const cfg = loadEngineConfig(root);
  const siteUrl = getSiteUrl();
  const targets = cfg.seoExpansionTargets || [];

  const base = {
    generatedAt: new Date().toISOString(),
    weekId: weekId || new Date().toISOString().slice(0, 10),
    siteUrl,
    aiUsed: false,
    strategy: null,
    keywordDiscovery: [],
    competitorGaps: [],
    landingOutlines: targets.map((t) => ({
      slug: t.slug,
      suggestedPath: `/solutions/${t.slug}`,
      seedKeywords: t.keywords || [],
    })),
    interviewQaPages: [
      { path: "/solutions/interview-preparation", focus: "Essential Advanced + Elite rehearsal positioning" },
    ],
    atsPages: [{ path: "/solutions/ats-resume", focus: "Parser discipline + keyword scaffolding" }],
    multilingual: { en: true, fr: true, note: "Hreflang via sitemap; FR routes policy-safe only" },
  };

  if (!process.env.DEEPSEEK_API_KEY) {
    base.note = "DEEPSEEK_API_KEY unset — deterministic outlines only";
    return base;
  }

  const prompt = `You are Resumora SEO Brain. Site: ${siteUrl}. Week: ${base.weekId}.
Return ONE JSON object only with keys:
strategy (string), keywordDiscovery (array of {phrase, intent, priority}), competitorGaps (array of strings),
architectureNotes (array), weeklyActions (array).
Focus: free organic growth, ATS resume, executive resume, interview prep, bilingual EN/FR Canada.
Targets: ${targets.map((t) => t.slug).join(", ")}`;

  const r = await chatCompletions({
    model: MODELS.v3,
    messages: [
      { role: "system", content: "Return valid JSON only." },
      { role: "user", content: prompt },
    ],
    maxTokens: 1200,
    temperature: 0.35,
  });

  if (r.ok && r.text) {
    try {
      const cleaned = r.text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
      const j = JSON.parse(cleaned.match(/\{[\s\S]*\}/)?.[0] || cleaned);
      base.aiUsed = true;
      base.strategy = j.strategy || null;
      base.keywordDiscovery = j.keywordDiscovery || [];
      base.competitorGaps = j.competitorGaps || [];
      base.architectureNotes = j.architectureNotes || [];
      base.weeklyActions = j.weeklyActions || [];
    } catch {
      base.aiRaw = r.text.slice(0, 2000);
    }
  } else {
    base.aiError = r.error || "deepseek_failed";
  }

  return base;
}

module.exports = { runDeepSeekSeoBrain, loadEngineConfig };
