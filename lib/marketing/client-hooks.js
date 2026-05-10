import { useCallback, useMemo, useState } from "react";
import { QUOTE_STORAGE_KEY } from "@/lib/marketing/service-quote-pricing";
import { resolveStripePriceId } from "@/lib/marketing/stripe-plan-map";
import { pricingPlans } from "@/lib/marketing/site-copy";

function logStripeInternal(code, payload) {
  console.error(`[Resumora Stripe:${code}]`, payload);
}

function readAlignedServiceDraft(planId) {
  if (typeof window === "undefined") return "";
  try {
    const raw = sessionStorage.getItem(QUOTE_STORAGE_KEY);
    if (!raw) return "";
    const b = JSON.parse(raw);
    if (b?.quote?.tier !== planId) return "";
    return typeof b.metaCompact === "string" ? b.metaCompact : "";
  } catch {
    return "";
  }
}

export function useStripePlans() {
  return useMemo(
    () =>
      pricingPlans.map((plan) => ({
        ...plan,
        priceId: resolveStripePriceId(plan.id),
      })),
    []
  );
}

function readUtmFromLocation() {
  if (typeof window === "undefined") {
    return { utm_source: "", utm_medium: "", utm_campaign: "" };
  }
  try {
    const p = new URLSearchParams(window.location.search);
    return {
      utm_source: p.get("utm_source") || "",
      utm_medium: p.get("utm_medium") || "",
      utm_campaign: p.get("utm_campaign") || "",
    };
  } catch {
    return { utm_source: "", utm_medium: "", utm_campaign: "" };
  }
}

function userFacingCheckoutError(status, data) {
  if (status === 503) {
    return "Payment service is not available (check STRIPE_SECRET_KEY on the server).";
  }
  if (data && typeof data.error === "string" && data.error.length > 0) {
    return data.error.length > 180 ? `${data.error.slice(0, 177)}…` : data.error;
  }
  if (status === 400) {
    return "Checkout was rejected (often missing or invalid Stripe Price IDs).";
  }
  return "Checkout could not start. See the console for details.";
}

export function useStripeCheckout() {
  const [busyPlan, setBusyPlan] = useState("");
  const [checkoutError, setCheckoutError] = useState("");
  const dynamicPlans = useStripePlans();

  const handleCheckout = useCallback(async (planId, planName, planPrice) => {
    /* BossMind gate: engagement session required before Stripe (POST /api/checkout). Unauthenticated → Register with plan. */
    setCheckoutError("");
    try {
      const authRes = await fetch("/api/engagement/stats", { credentials: "same-origin" });
      const auth = await authRes.json().catch(() => ({}));
      if (!auth.signedIn) {
        setPendingCheckoutPlan(planId);
        if (typeof window !== "undefined") {
          window.location.assign(`/register?plan=${encodeURIComponent(planId)}`);
        }
        return;
      }
    } catch {
      setCheckoutError("Could not verify sign-in. Try again.");
      return;
    }

    /* Authenticated — POST /api/checkout (mode payment); server resolves NEXT_PUBLIC_STRIPE_PRICE_* */
    setBusyPlan(planId);
    try {
      const utm = readUtmFromLocation();
      const serviceDraftSummary = readAlignedServiceDraft(planId);
      const response = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          planId,
          planName,
          planPrice,
          serviceDraftSummary,
          ...utm,
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.id) {
        const hint = typeof data?.hint === "string" ? data.hint : "";
        logStripeInternal(response.status === 400 ? "CHECKOUT_REJECTED" : "CHECKOUT_HTTP_ERROR", {
          planId,
          httpStatus: response.status,
          error: data?.error,
          hint,
        });
        setCheckoutError(userFacingCheckoutError(response.status, data));
        return;
      }
      const stripePublicKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
      if (!stripePublicKey) {
        logStripeInternal("STRIPE_PUBLISHABLE_MISSING", {
          planId,
          note: "Set NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY in environment.",
        });
        setCheckoutError("Missing publishable key (NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY).");
        return;
      }
      const stripeLib = await import("@stripe/stripe-js");
      const stripe = await stripeLib.loadStripe(stripePublicKey);
      if (!stripe) {
        logStripeInternal("STRIPE_JS_INIT_FAILED", { planId });
        setCheckoutError("Could not load Stripe.js.");
        return;
      }
      const { error } = await stripe.redirectToCheckout({ sessionId: data.id });
      if (error) {
        logStripeInternal("STRIPE_REDIRECT_ERROR", {
          planId,
          message: error.message,
          code: error.code,
          type: error.type,
        });
        setCheckoutError(error.message || "Stripe redirect failed.");
      }
    } catch (error) {
      const message = error?.message ?? String(error);
      const stripeCode =
        typeof error?.code === "string" ? error.code : typeof error?.type === "string" ? error.type : undefined;
      logStripeInternal("CHECKOUT_CLIENT_FLOW_ERROR", {
        planId,
        message,
        stripeCode,
      });
      setCheckoutError("Checkout error — see console for details.");
    } finally {
      setBusyPlan("");
    }
  }, []);

  return { busyPlan, handleCheckout, dynamicPlans, checkoutError };
}
