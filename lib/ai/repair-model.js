const ollama = require("ollama");
const { chatCompletions, MODELS } = require("./deepseek");

/**
 * BossMind repair planner: prefer DeepSeek R1 when configured, else local Ollama.
 */
async function callRepairPlannerModel({
  prompt,
  ollamaModel = process.env.OLLAMA_REPAIR_MODEL || "qwen2.5-coder:1.5b",
}) {
  if (process.env.DEEPSEEK_API_KEY) {
    const r = await chatCompletions({
      model: MODELS.r1,
      messages: [
        {
          role: "system",
          content:
            "You are a senior engineer. Output a concise reusable repair pattern for the codebase. No preamble.",
        },
        { role: "user", content: prompt },
      ],
      maxTokens: 600,
      temperature: 0.2,
    });
    if (r.ok && r.text) return r.text;
  }

  const response = await ollama.chat({
    model: ollamaModel,
    messages: [{ role: "user", content: prompt }],
  });
  return response?.message?.content || "";
}

module.exports = { callRepairPlannerModel };
