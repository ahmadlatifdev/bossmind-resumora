require("../../../lib/shared/ensure-project-env");
const { registerProfile, createSession } = require("../../../lib/engagement/store");
const { linkEntitlementsToProfile } = require("../../../lib/client/entitlements-store");
const { serializeCookie, COOKIE_SESSION } = require("../../../lib/engagement/cookies");
const { requireDatabaseReady } = require("../../../lib/shared/require-database");
const { notifyPostPurchaseWebhook } = require("../../../lib/client/post-purchase-provision");

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const dbGate = await requireDatabaseReady();
  if (!dbGate.ok) {
    return res.status(dbGate.status).json(dbGate.body);
  }

  const { email, password, displayName } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: "Email and password required" });
  }

  try {
    const result = await registerProfile({ email, password, displayName: displayName || "" });
    if (!result.ok) {
      return res.status(409).json({ error: result.error || "register_failed" });
    }

    await linkEntitlementsToProfile(result.profile.id, result.profile.email);

    const session = await createSession(result.profile.id);
    if (!session) {
      return res.status(500).json({ error: "Session failed" });
    }

    const cookie = serializeCookie(COOKIE_SESSION, session.token, { maxAge: 14 * 24 * 60 * 60 });
    res.setHeader("Set-Cookie", cookie);
    const siteOrigin = String(process.env.NEXT_PUBLIC_SITE_URL || "https://www.resumora.net").replace(/\/$/, "");
    await notifyPostPurchaseWebhook({
      event: "resumora.registration_confirmed",
      customerEmail: result.profile.email,
      studioUrl: `${siteOrigin}/studio`,
      account: {
        profileId: result.profile.id,
        emailVerified: true,
      },
      onboarding: {
        steps: [
          "Account Created",
          "Payment Confirmed",
          "Documents Uploaded",
          "Resume In Progress",
          "Resume Ready",
          "Free Edit Available",
          "Delivery Completed",
        ],
      },
    }).catch(() => {});

    return res.status(201).json({
      ok: true,
      profile: {
        id: result.profile.id,
        email: result.profile.email,
        displayName: result.profile.display_name ?? "",
      },
    });
  } catch (e) {
    return res.status(500).json({ error: e.message || "Server error" });
  }
}
