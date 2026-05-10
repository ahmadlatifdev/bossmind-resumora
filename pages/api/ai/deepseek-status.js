const { getDeepSeekIntegrationStatus } = require("../../../lib/ai/deepseek");

/** BossMind / automation visibility — DeepSeek V3 + R1 connectivity. No secrets returned. */
export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }
  try {
    const status = await getDeepSeekIntegrationStatus();
    return res.status(200).json({
      service: "deepseek",
      bossmindRouting: "repair + weekly marketing (optional)",
      ...status,
    });
  } catch (e) {
    return res.status(500).json({ error: e.message || "status_failed" });
  }
}
