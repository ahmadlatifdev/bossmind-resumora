/**
 * Verified publish checks — links, branding markers, optional live URL proof.
 */
const { runBrandAssetVerification } = require("./bossmind-brand-asset-verify");

async function probeUrl(url, timeoutMs = 15000) {
  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(timeoutMs),
      headers: { "cache-control": "no-cache", "user-agent": "BossMindMarketingVerify/1.0" },
    });
    return { url, ok: res.ok, status: res.status };
  } catch (e) {
    return { url, ok: false, status: 0, error: e.message };
  }
}

async function verifyPostItem(item, { origin, siteUrl = "https://resumora.net" }) {
  const ctaChecks = await Promise.all([
    probeUrl(item.urls?.pricing || `${siteUrl}/pricing`),
    probeUrl(item.urls?.contact || `${siteUrl}/contact`),
    probeUrl(item.urls?.register || `${siteUrl}/register`),
  ]);
  const ctaOk = ctaChecks.every((c) => c.ok);
  const captionOk =
    Boolean(item.caption) &&
    !/placeholder|lorem|fake logo|mockup/i.test(item.caption) &&
    (item.caption.includes("resumora") || item.caption.includes("Resumora"));
  const logoInBrief = String(item.assetBrief?.watermark || "").includes("resumora-logo-official");
  const hashtagsOk = Array.isArray(item.hashtags) && item.hashtags.length >= 3;

  let brandProbe = null;
  if (origin) {
    brandProbe = await runBrandAssetVerification({ origin, probeHtml: true });
  }

  const ok = ctaOk && captionOk && hashtagsOk && logoInBrief && (!brandProbe || brandProbe.ok);

  return {
    ok,
    platform: item.platform,
    postId: item.id,
    ctaChecks,
    captionOk,
    logoInBrief,
    hashtagsOk,
    brandOk: brandProbe?.ok ?? null,
    brandHashOk: brandProbe?.hashOk ?? null,
    blockers: [
      !ctaOk && "cta_links_failed",
      !captionOk && "caption_invalid",
      !hashtagsOk && "hashtags_missing",
      !logoInBrief && "logo_not_in_asset_brief",
      brandProbe && !brandProbe.ok && "brand_authority_failed",
    ].filter(Boolean),
  };
}

async function verifyPublishedBatch(queue, { origin, publishResults = [] } = {}) {
  const verifications = [];
  for (const item of queue) {
    const pub = publishResults.find((r) => r.platform === item.platform) || {};
    const contentCheck = await verifyPostItem(item, { origin });
    verifications.push({
      ...contentCheck,
      publishOk: Boolean(pub.ok),
      publishSkipped: Boolean(pub.skipped),
      publishReason: pub.reason || null,
      verified: contentCheck.ok && (pub.ok || pub.skipped),
      platformUrl: pub.platformUrl || null,
      screenshotPath: pub.screenshotPath || null,
    });
  }
  const ok = verifications.every((v) => v.verified || v.publishSkipped);
  return { ok, verifications };
}

module.exports = {
  probeUrl,
  verifyPostItem,
  verifyPublishedBatch,
};
