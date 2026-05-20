/**
 * Admin-only endpoint: delivery status + edit acceptance workflow.
 */
require("../../../lib/shared/ensure-project-env");
const { getSqlClient, ensureEngagementSchema } = require("../../../lib/shared/neon-memory");
const { acceptEditRequest, upsertDeliveryStatus } = require("../../../lib/client/workspace-store");
const { notifyPostPurchaseWebhook } = require("../../../lib/client/post-purchase-provision");
const { upsertGenerationStatus } = require("../../../lib/client/workspace-store");

function authorize(req) {
  const secret = process.env.BOSSMIND_ORCHESTRATION_SECRET;
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  return Boolean(secret && token === secret);
}

export default async function handler(req, res) {
  if (!authorize(req)) return res.status(401).json({ error: "Unauthorized" });
  await ensureEngagementSchema();
  const sql = getSqlClient();
  if (!sql) return res.status(503).json({ error: "database_unavailable" });

  if (req.method === "GET") {
    const rows = await sql.query(
      `SELECT e.profile_id, e.customer_email, e.plan_id, e.granted_at,
              d.status AS delivery_status, d.download_url, d.email_status, d.delivered_at,
              (
                SELECT COUNT(*)::int FROM client_workspace_documents cd
                WHERE cd.profile_id = e.profile_id AND cd.plan_id = e.plan_id AND cd.removed_at IS NULL
              ) AS documents_count,
              (
                SELECT COUNT(*)::int FROM client_edit_requests er
                WHERE er.profile_id = e.profile_id AND er.plan_id = e.plan_id
              ) AS edit_requests_count
       FROM client_entitlements e
       LEFT JOIN client_delivery_status d
         ON d.profile_id = e.profile_id AND d.plan_id = e.plan_id
       ORDER BY e.granted_at DESC
       LIMIT 500`
    );
    return res.status(200).json({ ok: true, clients: rows || [] });
  }

  if (req.method === "POST") {
    const action = String(req.body?.action || "noop");
    if (action === "accept_edit_request") {
      const requestId = Number(req.body?.requestId || 0);
      const acceptedBy = String(req.body?.acceptedBy || "admin");
      const result = await acceptEditRequest({ requestId, acceptedBy });
      if (!result.ok) return res.status(400).json({ error: result.error || "accept_failed" });
      return res.status(200).json({ ok: true, request: result.request });
    }
    if (action === "mark_delivery_ready") {
      const profileId = String(req.body?.profileId || "").trim();
      const planId = String(req.body?.planId || "").trim().toLowerCase();
      const downloadUrl = String(req.body?.downloadUrl || "").trim();
      if (!profileId || !planId) return res.status(400).json({ error: "profileId and planId required" });
      const up = await upsertDeliveryStatus({
        profileId,
        planId,
        status: "ready",
        downloadUrl: downloadUrl || null,
        message: "Resume package is ready for download.",
        emailStatus: "queued",
        metadata: { source: "client-delivery-admin" },
      });
      if (!up.ok) return res.status(400).json({ error: up.error || "delivery_update_failed" });
      // Email/webhook notification hook
      const to = String(req.body?.customerEmail || "").trim();
      const site = String(process.env.NEXT_PUBLIC_SITE_URL || "https://www.resumora.net").replace(/\/$/, "");
      await notifyPostPurchaseWebhook({
        event: "resumora.delivery_ready",
        customerEmail: to || null,
        planId,
        studioUrl: `${site}/studio`,
        downloadUrl: downloadUrl || null,
      }).catch(() => {});
      return res.status(200).json({ ok: true, delivery: up.delivery });
    }
    if (action === "set_generation_status") {
      const profileId = String(req.body?.profileId || "").trim();
      const planId = String(req.body?.planId || "").trim().toLowerCase();
      const status = String(req.body?.status || "queued").trim().toLowerCase();
      const stageMessage = String(req.body?.stageMessage || "").trim().slice(0, 300);
      if (!profileId || !planId) return res.status(400).json({ error: "profileId and planId required" });
      const allowed = ["queued", "analyzing", "generating", "reviewing", "finalizing", "ready"];
      if (!allowed.includes(status)) return res.status(400).json({ error: "invalid_generation_status" });
      const updated = await upsertGenerationStatus({ profileId, planId, status, stageMessage });
      if (!updated.ok) return res.status(400).json({ error: updated.error || "generation_update_failed" });
      if (status === "ready") {
        await upsertDeliveryStatus({
          profileId,
          planId,
          status: "ready",
          message: "Resume ready for delivery.",
          emailStatus: "queued",
          metadata: { source: "generation_ready" },
        }).catch(() => {});
        await notifyPostPurchaseWebhook({
          event: "resumora.resume_ready",
          planId,
          studioUrl: `${String(process.env.NEXT_PUBLIC_SITE_URL || "https://www.resumora.net").replace(/\/$/, "")}/studio`,
        }).catch(() => {});
      } else {
        await notifyPostPurchaseWebhook({
          event: "resumora.generation_status",
          planId,
          stage: status,
          stageMessage,
          studioUrl: `${String(process.env.NEXT_PUBLIC_SITE_URL || "https://www.resumora.net").replace(/\/$/, "")}/studio`,
        }).catch(() => {});
      }
      return res.status(200).json({ ok: true, generation: updated.generation });
    }
    return res.status(400).json({ error: "unknown_action" });
  }

  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ error: "Method not allowed" });
}
