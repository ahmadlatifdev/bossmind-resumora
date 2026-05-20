require("../../../lib/shared/ensure-project-env");
const { readEngagementActor } = require("../../../lib/engagement/http-context");
const {
  hasEntitlement,
  listEditRequests,
  createEditRequest,
  getFreeEditsSummary,
} = require("../../../lib/client/workspace-store");

export default async function handler(req, res) {
  const actor = await readEngagementActor(req, res);
  if (!actor.profileId) {
    return res.status(401).json({ error: "sign_in_required" });
  }

  if (req.method === "GET") {
    const planId = String(req.query.planId || "").trim().toLowerCase();
    if (!planId) return res.status(400).json({ error: "planId required" });
    const access = await hasEntitlement(actor.profileId, actor.profileEmail, planId);
    if (!access.entitled) return res.status(403).json({ error: "not_entitled" });
    const requests = await listEditRequests(actor.profileId, planId);
    const freeEdits = await getFreeEditsSummary(actor.profileId, planId);
    return res.status(200).json({ ok: true, requests, freeEdits });
  }

  if (req.method === "POST") {
    const planId = String(req.body?.planId || "").trim().toLowerCase();
    const notes = String(req.body?.notes || "").trim();
    if (!planId || notes.length < 8) {
      return res.status(400).json({ error: "planId and notes(min 8 chars) required" });
    }
    const access = await hasEntitlement(actor.profileId, actor.profileEmail, planId);
    if (!access.entitled) return res.status(403).json({ error: "not_entitled" });
    const freeEdits = await getFreeEditsSummary(actor.profileId, planId);
    if (freeEdits.remaining <= 0) {
      return res.status(409).json({ error: "no_free_edits_remaining", freeEdits });
    }
    const created = await createEditRequest({ profileId: actor.profileId, planId, notes });
    if (!created.ok) return res.status(400).json({ error: created.error || "request_failed" });
    const requests = await listEditRequests(actor.profileId, planId);
    return res.status(200).json({ ok: true, request: created.request, requests, freeEdits });
  }

  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ error: "Method not allowed" });
}
