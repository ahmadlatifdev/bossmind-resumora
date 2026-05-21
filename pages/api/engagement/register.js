require("../../../lib/shared/ensure-project-env");
const { registerProfile, createSession } = require("../../../lib/engagement/store");
const { linkEntitlementsToProfile } = require("../../../lib/client/entitlements-store");
const { runActivationEngine } = require("../../../lib/client/activation-engine");
const { markOnboarding, upsertOnboardingFromSession } = require("../../../lib/client/onboarding-journey");
const { serializeCookie, COOKIE_SESSION } = require("../../../lib/engagement/cookies");
const { requireDatabaseReady } = require("../../../lib/shared/require-database");
const { notifyPostPurchaseWebhook } = require("../../../lib/client/post-purchase-provision");

function normalizeEmail(email) {
  return String(email || "")
    .trim()
    .toLowerCase();
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const dbGate = await requireDatabaseReady();
  if (!dbGate.ok) {
    return res.status(dbGate.status).json(dbGate.body);
  }

  const { email, password, displayName, stripe_session_id: stripeSessionId, lang = "en" } = req.body || {};
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

    let activationPayload = null;
    const sid = String(stripeSessionId || "").trim();
    if (sid) {
      activationPayload = await runActivationEngine(
        { profileId: result.profile.id, profileEmail: result.profile.email },
        sid,
        { lang: String(lang).toLowerCase() === "fr" ? "fr" : "en", maxAttempts: 3 }
      );

      if (activationPayload.failedStep) {
        console.error("[register] checkout_activation_incomplete", {
          sessionId: sid.slice(0, 22),
          failedStep: activationPayload.failedStep,
          phase: activationPayload.phase,
        });
      }

      if (activationPayload.activationStatus === "email_mismatch") {
        return res.status(403).json({
          error: "checkout_email_mismatch",
          failedStep: "auth_email_mismatch",
          stripeCheckoutEmail: activationPayload.stripeCheckoutEmail,
          profileEmail: normalizeEmail(result.profile.email),
        });
      }

      if (activationPayload.activationSuccess) {
        await upsertOnboardingFromSession(result.profile.id, sid);
        await markOnboarding(result.profile.id, {
          paymentCompleted: true,
          planSelected: true,
          activePlanId: activationPayload.planId || null,
        });
      }
    }

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

    const { logs, ...activationSafe } = activationPayload || {};

    return res.status(201).json({
      ok: true,
      profile: {
        id: result.profile.id,
        email: result.profile.email,
        displayName: result.profile.display_name ?? "",
      },
      activation: activationSafe || null,
    });
  } catch (e) {
    console.error("[register] server_error", e.message);
    return res.status(500).json({ error: e.message || "Server error" });
  }
}
