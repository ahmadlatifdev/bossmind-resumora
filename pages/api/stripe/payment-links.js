const fs = require("fs");
const path = require("path");

function loadLockManifest() {
  const p = path.join(process.cwd(), "config/resumora-stripe-payment-links-lock.json");
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return null;
  }
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const manifest = loadLockManifest();
  if (!manifest?.planRoutes) {
    return res.status(503).json({
      ok: false,
      error: "payment_links_not_provisioned",
      hint: "Run npm run bossmind:stripe:payment-links:apply on the deployment runner.",
    });
  }

  return res.status(200).json({
    ok: true,
    officialBrand: manifest.officialBrand || "Resumora",
    manifestHash: manifest.manifestHash,
    generatedAt: manifest.generatedAt,
    planRoutes: manifest.planRoutes,
    services: (manifest.services || []).map((s) => ({
      serviceKey: s.serviceKey,
      name: s.name,
      amountUsd: s.amountUsd,
      planIds: s.planIds,
      paymentLinkUrl: s.paymentLinkUrl,
    })),
  });
}
