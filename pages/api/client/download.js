require("../../../lib/shared/ensure-project-env");
const { readEngagementActor } = require("../../../lib/engagement/http-context");
const { ensureEngagementSchema } = require("../../../lib/shared/neon-memory");
const { hasEntitlement } = require("../../../lib/client/entitlements-store");
const { renderWelcomeGuide } = require("../../../lib/client/deliverables-catalog");

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const planId = String(req.query.planId || "").trim();
  const assetId = String(req.query.assetId || "welcome").trim();
  const format = String(req.query.format || "md").toLowerCase();
  const lang = String(req.query.lang || "en").toLowerCase() === "fr" ? "fr" : "en";

  if (!planId) {
    return res.status(400).json({ error: "planId required" });
  }

  try {
    await ensureEngagementSchema();
    const actor = await readEngagementActor(req, res);
    const access = await hasEntitlement(actor.profileId, actor.profileEmail, planId);
    if (!access.entitled) {
      return res.status(403).json({ error: "not_entitled" });
    }

    const body = renderWelcomeGuide(planId, lang);
    if (!body) {
      return res.status(404).json({ error: "asset_not_found" });
    }

    const ext = format === "pdf" ? "pdf" : format === "docx" ? "docx" : "md";
    const mime =
      format === "pdf"
        ? "application/pdf"
        : format === "docx"
          ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          : "text/markdown; charset=utf-8";
    const filename = `resumora-${planId}-${lang}.${ext}`;
    res.setHeader("Content-Type", mime);
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Cache-Control", "private, no-store");
    return res.status(200).send(body);
  } catch (e) {
    return res.status(500).json({ error: e.message || "Server error" });
  }
}
