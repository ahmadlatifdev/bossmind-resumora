import { useMemo, useState } from "react";
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

export function useStripeCheckout() {
  const [busyPlan, setBusyPlan] = useState("");
  const dynamicPlans = useStripePlans();

  const handleCheckout = async (planId, planName, planPrice) => {
    /* Always POST — server resolves STRIPE_* / NEXT_PUBLIC_* price IDs; client bundle only exposes NEXT_PUBLIC_*. */
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
        return;
      }
      const stripePublicKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
      if (!stripePublicKey) {
        logStripeInternal("STRIPE_PUBLISHABLE_MISSING", {
          planId,
          note: "Set NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY in environment.",
        });
        return;
      }
      const stripeLib = await import("@stripe/stripe-js");
      const stripe = await stripeLib.loadStripe(stripePublicKey);
      if (!stripe) {
        logStripeInternal("STRIPE_JS_INIT_FAILED", { planId });
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
    } finally {
      setBusyPlan("");
    }
  };

  return { busyPlan, handleCheckout, dynamicPlans };
}
