/**
 * Post-login/register redirect — paid Stripe session_id always wins over pricing.
 */
import {
  getPendingCheckoutPlan,
  normalizeCheckoutPlanId,
  setPendingCheckoutPlan,
} from "./checkout-plan-persistence";

export const RS_CHECKOUT_SESSION_KEY = "rs_last_checkout_session";

function firstQuery(value) {
  if (typeof value === "string") return value;
  if (Array.isArray(value) && typeof value[0] === "string") return value[0];
  return "";
}

/** Extract cs_* session id from a relative or absolute URL/path. */
export function extractSessionIdFromPath(path) {
  const raw = String(path || "").trim();
  if (!raw) return "";
  try {
    const base = raw.startsWith("http") ? undefined : "https://local.invalid";
    const u = new URL(raw, base);
    return String(u.searchParams.get("session_id") || "").trim();
  } catch {
    const m = raw.match(/[?&]session_id=([^&]+)/i);
    return m ? decodeURIComponent(m[1]) : "";
  }
}

export function persistCheckoutSessionId(sessionId) {
  const sid = String(sessionId || "").trim();
  if (!sid || typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(RS_CHECKOUT_SESSION_KEY, sid);
  } catch {
    /* ignore */
  }
}

export function getStoredCheckoutSessionId() {
  if (typeof sessionStorage === "undefined") return "";
  try {
    return String(sessionStorage.getItem(RS_CHECKOUT_SESSION_KEY) || "").trim();
  } catch {
    return "";
  }
}

export function clearStoredCheckoutSessionId() {
  try {
    sessionStorage.removeItem(RS_CHECKOUT_SESSION_KEY);
  } catch {
    /* ignore */
  }
}

function safeRelativePath(path) {
  const p = String(path || "").trim();
  if (!p.startsWith("/") || p.startsWith("//")) return "";
  return p;
}

/** True when user has a paid Stripe checkout session awaiting activation. */
export function hasPaidCheckoutPending(routerLike) {
  const next = safeRelativePath(firstQuery(routerLike?.query?.next));
  if (extractSessionIdFromPath(next)) return true;
  if (next.includes("/studio") && next.includes("session_id=")) return true;
  return Boolean(getStoredCheckoutSessionId());
}

/**
 * Resolve where to send the user after successful login/register.
 * Priority: next URL with session_id → stored session_id → pending plan → /studio
 */
export function resolvePostAuthRedirect(routerLike) {
  const nextRaw = safeRelativePath(firstQuery(routerLike?.query?.next));
  if (nextRaw) {
    const sid = extractSessionIdFromPath(nextRaw);
    if (sid) persistCheckoutSessionId(sid);
    if (sid || nextRaw.startsWith("/studio")) return nextRaw;
  }

  const storedSid = getStoredCheckoutSessionId();
  if (storedSid) {
    return `/studio?session_id=${encodeURIComponent(storedSid)}`;
  }

  const fromPlan = normalizeCheckoutPlanId(firstQuery(routerLike?.query?.plan));
  const fromSelectedPlan = normalizeCheckoutPlanId(firstQuery(routerLike?.query?.selectedPlan));
  const fromStorage = getPendingCheckoutPlan();
  const plan = fromPlan || fromSelectedPlan || fromStorage;
  if (plan) {
    setPendingCheckoutPlan(plan);
    return "/pricing?continueCheckout=1";
  }

  return "/studio";
}

/** @deprecated Use resolvePostAuthRedirect */
export function getPostAuthRedirectPath(routerLike) {
  return resolvePostAuthRedirect(routerLike);
}
