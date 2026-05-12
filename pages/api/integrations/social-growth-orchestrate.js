const {
  generateUnifiedGrowthBundle,
  persistGrowthBundle,
  runAutopublish,
} = require("../../../lib/marketing/social-growth-engine");

function authorize(req) {
  const secret = process.env.BOSSMIND_ORCHESTRATION_SECRET || process.env.SOCIAL_AUTOMATION_SECRET;
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  return secret && token === secret;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (!authorize(req)) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const body = req.body && typeof req.body === "object" ? req.body : {};
  const weekId = typeof body.weekId === "string" ? body.weekId : undefined;
  const trendSignals = Array.isArray(body.trendSignals) ? body.trendSignals : [];
  const persistNeon = body.persistNeon !== false;
  const autopublish = body.autopublish === true;
  const dryRun = body.dryRun !== false;
  const skipIfAlreadyPublished = body.skipIfAlreadyPublished !== false;

  try {
    const bundle = await generateUnifiedGrowthBundle({ weekId, trendSignals });
    const persist = persistNeon ? await persistGrowthBundle(bundle) : { persisted: false, reason: "disabled" };
    const publishResults = autopublish ? await runAutopublish(bundle, { dryRun, skipIfAlreadyPublished }) : [];
    return res.status(200).json({
      ok: true,
      weekId: bundle.weekId,
      queueSize: bundle.queue.length,
      persist,
      autopublish,
      dryRun,
      publishResults,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message || "Orchestration failed" });
  }
}
