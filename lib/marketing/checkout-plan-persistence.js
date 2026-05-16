/**
 * Persists selected Stripe tier across Register/Login → return to /pricing checkout resume.
 * Values: basic | professional | elite | essential_advanced (matches planId / NEXT_PUBLIC_STRIPE_PRICE_* mapping).
 */

const STORAGE_KEY = "rs_checkout_pending_plan";

export const ALLOWED_CHECKOUT_PLANS = ["basic", "professional", "elite", "essential_advanced"];

export function normalizeCheckoutPlanId(value) {
  const v = String(value ?? "")
    .toLowerCase()
    .trim();
  return ALLOWED_CHECKOUT_PLANS.includes(v) ? v : "";
}

export function setPendingCheckoutPlan(planId) {
  const n = normalizeCheckoutPlanId(planId);
  if (!n || typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(STORAGE_KEY, n);
  } catch {
    /* quota / private mode */
  }
}

export function getPendingCheckoutPlan() {
  if (typeof sessionStorage === "undefined") return "";
  try {
    return normalizeCheckoutPlanId(sessionStorage.getItem(STORAGE_KEY));
  } catch {
    return "";
  }
}

export function clearPendingCheckoutPlan() {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

function firstQuery(value) {
  if (typeof value === "string") return value;
  if (Array.isArray(value) && typeof value[0] === "string") return value[0];
  return "";
}

/** After Register/Login success: return pricing resume URL or dashboard. */
export function getPostAuthRedirectPath(routerLike) {
  const fromPlan = normalizeCheckoutPlanId(firstQuery(routerLike?.query?.plan));
  const fromSelectedPlan = normalizeCheckoutPlanId(
    firstQuery(routerLike?.query?.selectedPlan)
  );
  const fromStorage = getPendingCheckoutPlan();
  const plan = fromPlan || fromSelectedPlan || fromStorage;
  if (plan) {
    setPendingCheckoutPlan(plan);
    return "/pricing?continueCheckout=1";
  }
  return "/dashboard";
}
