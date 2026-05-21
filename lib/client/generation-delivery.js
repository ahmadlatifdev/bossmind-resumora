const { upsertDeliveryStatus } = require("./workspace-store");
const { notifyPostPurchaseWebhook } = require("./post-purchase-provision");

function siteOrigin() {
  return String(process.env.NEXT_PUBLIC_SITE_URL || "https://bossmind-resumora-web.onrender.com").replace(
    /\/$/,
    ""
  );
}

/**
 * When generation reaches ready: set delivery + bilingual download URLs (PDF/DOCX via secure API).
 */
async function finalizeGenerationDelivery({ profileId, planId, lang = "en" }) {
  if (!profileId || !planId) return { ok: false };
  const base = siteOrigin();
  const downloadUrl = `${base}/api/client/download?planId=${encodeURIComponent(planId)}&lang=${lang}`;
  const pdfUrl = `${base}/api/client/download?planId=${encodeURIComponent(planId)}&format=pdf&lang=${lang}`;
  const docxUrl = `${base}/api/client/download?planId=${encodeURIComponent(planId)}&format=docx&lang=${lang}`;
  const frUrl = `${base}/api/client/download?planId=${encodeURIComponent(planId)}&lang=fr`;

  await upsertDeliveryStatus({
    profileId,
    planId,
    status: "ready",
    downloadUrl,
    message: "Resume ready — PDF and DOCX available in your studio.",
    emailStatus: "queued",
    metadata: { pdfUrl, docxUrl, bilingualFrUrl: frUrl, formats: ["pdf", "docx"], finalizedAt: new Date().toISOString() },
  });

  await notifyPostPurchaseWebhook({
    event: "resumora.resume_ready",
    planId,
    studioUrl: `${base}/studio`,
    downloadUrl,
    emailTemplate: {
      subject: "Your Resumora resume is ready",
      body: `Your resume package is ready.\nDownload: ${downloadUrl}\nPDF: ${pdfUrl}\nDOCX: ${docxUrl}`,
    },
  }).catch(() => {});

  return { ok: true, downloadUrl, pdfUrl, docxUrl };
}

module.exports = { finalizeGenerationDelivery };
