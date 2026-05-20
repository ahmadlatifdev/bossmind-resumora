require("../../../lib/shared/ensure-project-env");
const { readEngagementActor } = require("../../../lib/engagement/http-context");
const { ensureEngagementSchema } = require("../../../lib/shared/neon-memory");
const { hasEntitlement } = require("../../../lib/client/entitlements-store");
const {
  getGenerationStatus,
  upsertGenerationStatus,
  listWorkspaceDocuments,
} = require("../../../lib/client/workspace-store");
const { markOnboarding } = require("../../../lib/client/onboarding-journey");

const PIPELINE = [
  { key: "queued", pct: 5 },
  { key: "analyzing", pct: 25 },
  { key: "optimizing", pct: 45 },
  { key: "generating", pct: 65 },
  { key: "reviewing", pct: 80 },
  { key: "finalizing", pct: 92 },
  { key: "ready", pct: 100 },
];

async function advanceGenerationPipeline(profileId, planId) {
  const current = await getGenerationStatus(profileId, planId);
  const status = current?.status || current?.payload?.status || "queued";
  const idx = PIPELINE.findIndex((p) => p.key === status);
  const next = PIPELINE[Math.min(idx + 1, PIPELINE.length - 1)];
  if (!next || next.key === status) return { advanced: false, status, stage: status };
  await upsertGenerationStatus({
    profileId,
    planId,
    status: next.key,
    stageMessage: `Stage: ${next.key}`,
    metadata: { pipeline: true, at: new Date().toISOString() },
  });
  const docs = await listWorkspaceDocuments(profileId, planId);
  const hasResume = docs.some((d) => d.doc_type === "resume");
  if (hasResume && next.key === "ready") {
    await markOnboarding(profileId, { deliveryReady: true });
  }
  return { advanced: true, status: next.key, stage: next.key };
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const actor = await readEngagementActor(req, res);
  if (!actor.profileId) return res.status(401).json({ error: "sign_in_required" });
  const planId = String(req.body?.planId || "").trim().toLowerCase();
  if (!planId) return res.status(400).json({ error: "planId required" });
  const access = await hasEntitlement(actor.profileId, actor.profileEmail, planId);
  if (!access.entitled) return res.status(403).json({ error: "not_entitled" });

  const docs = await listWorkspaceDocuments(actor.profileId, planId);
  if (!docs.some((d) => d.doc_type === "resume")) {
    return res.status(400).json({ error: "upload_resume_first" });
  }

  const result = await advanceGenerationPipeline(actor.profileId, planId);
  return res.status(200).json({ ok: true, ...result });
}
