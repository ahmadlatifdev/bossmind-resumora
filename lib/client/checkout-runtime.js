/**
 * Client checkout journey — redirect anti-loop, runtime diagnostics, session persistence.
 */

export const RS_CHECKOUT_SESSION_KEY = "rs_last_checkout_session";
export const RS_REDIRECT_TRACE_KEY = "rs_redirect_trace";
export const RS_RUNTIME_DIAG_KEY = "rs_runtime_diag";
export const RS_SW_CLEARED_KEY = "rs_sw_checkout_cleared";

const MAX_REDIRECTS_IN_WINDOW = 8;
const REDIRECT_WINDOW_MS = 20000;
const MAX_SAME_PAIR = 3;

export function logCheckoutRuntime(event, detail = {}) {
  if (typeof window === "undefined") return;
  const entry = {
    event,
    detail,
    path: window.location.pathname + window.location.search,
    at: new Date().toISOString(),
  };
  try {
    const prev = JSON.parse(sessionStorage.getItem(RS_RUNTIME_DIAG_KEY) || "[]");
    prev.push(entry);
    while (prev.length > 40) prev.shift();
    sessionStorage.setItem(RS_RUNTIME_DIAG_KEY, JSON.stringify(prev));
  } catch {
    /* ignore */
  }
  if (process.env.NODE_ENV === "development") {
    console.info("[checkout-runtime]", event, detail);
  }
  fetch("/api/client/runtime-log", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify(entry),
    keepalive: true,
  }).catch(() => {});
}

function readRedirectTrace() {
  if (typeof sessionStorage === "undefined") return [];
  try {
    return JSON.parse(sessionStorage.getItem(RS_REDIRECT_TRACE_KEY) || "[]");
  } catch {
    return [];
  }
}

export function recordRedirect(from, to) {
  if (typeof window === "undefined") return;
  const entry = { from: String(from || ""), to: String(to || ""), at: Date.now() };
  const trace = readRedirectTrace();
  trace.push(entry);
  while (trace.length > 30) trace.shift();
  try {
    sessionStorage.setItem(RS_REDIRECT_TRACE_KEY, JSON.stringify(trace));
  } catch {
    /* ignore */
  }
  logCheckoutRuntime("redirect", entry);
}

export function shouldBlockRedirect(from, to) {
  const trace = readRedirectTrace();
  const now = Date.now();
  const recent = trace.filter((t) => now - t.at < REDIRECT_WINDOW_MS);
  if (recent.length >= MAX_REDIRECTS_IN_WINDOW) {
    logCheckoutRuntime("redirect_loop_blocked", { reason: "max_redirects", from, to, count: recent.length });
    return true;
  }
  const pairCount = recent.filter((t) => t.from === from && t.to === to).length;
  if (pairCount >= MAX_SAME_PAIR) {
    logCheckoutRuntime("redirect_loop_blocked", { reason: "ping_pong", from, to, pairCount });
    return true;
  }
  return false;
}

export function persistCheckoutSessionId(sessionId) {
  const sid = String(sessionId || "").trim();
  if (!sid || typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(RS_CHECKOUT_SESSION_KEY, sid);
    sessionStorage.setItem("rs_checkout_session_ts", String(Date.now()));
    logCheckoutRuntime("session_persisted", { sessionIdPrefix: sid.slice(0, 20) });
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

export function clearRedirectTrace() {
  try {
    sessionStorage.removeItem(RS_REDIRECT_TRACE_KEY);
  } catch {
    /* ignore */
  }
}

/** Drop stale checkout session markers (default 48h). */
export function cleanupStaleCheckoutSession(maxAgeHours = 48) {
  if (typeof sessionStorage === "undefined") return;
  const key = "rs_checkout_session_ts";
  try {
    const sid = sessionStorage.getItem(RS_CHECKOUT_SESSION_KEY);
    const ts = Number(sessionStorage.getItem(key) || 0);
    const now = Date.now();
    if (sid && ts && now - ts > maxAgeHours * 3600 * 1000) {
      sessionStorage.removeItem(RS_CHECKOUT_SESSION_KEY);
      sessionStorage.removeItem(key);
      sessionStorage.removeItem(RS_SW_CLEARED_KEY);
      logCheckoutRuntime("session_expired_cleanup", { maxAgeHours });
    } else if (sid && !ts) {
      sessionStorage.setItem(key, String(now));
    }
  } catch {
    /* ignore */
  }
}

/** Prefetch server activation before navigating to studio (best-effort). */
export async function prefetchCheckoutActivation(sessionId, lang = "en") {
  const sid = String(sessionId || "").trim();
  if (!sid) return null;
  logCheckoutRuntime("activation_prefetch_start", { sessionIdPrefix: sid.slice(0, 20) });
  try {
    const qs = new URLSearchParams({ lang, session_id: sid, attempt: "1" });
    const res = await fetch(`/api/client/checkout-complete?${qs.toString()}`, {
      credentials: "same-origin",
      cache: "no-store",
    });
    const data = await res.json().catch(() => ({}));
    logCheckoutRuntime("activation_prefetch_done", {
      ok: res.ok,
      activationStatus: data.activationStatus,
      activationSuccess: data.activationSuccess,
      failedStep: data.failedStep,
      signedIn: data.signedIn,
    });
    return data;
  } catch (e) {
    logCheckoutRuntime("activation_prefetch_error", { message: e?.message });
    return null;
  }
}

const CHECKOUT_PATH_PREFIXES = ["/studio", "/login", "/success", "/pricing", "/register", "/dashboard"];

export function isCheckoutSensitivePath(pathname) {
  const p = String(pathname || "");
  return CHECKOUT_PATH_PREFIXES.some((prefix) => p === prefix || p.startsWith(`${prefix}/`));
}

/** Clear stale SW caches on checkout-sensitive routes (once per tab session). */
export async function clearStaleServiceWorkerCaches(reason = "checkout_route") {
  if (typeof window === "undefined") return;
  try {
    if (sessionStorage.getItem(RS_SW_CLEARED_KEY) === "1") return;
  } catch {
    /* continue */
  }
  logCheckoutRuntime("sw_cache_clear_start", { reason });
  try {
    if ("serviceWorker" in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      for (const reg of regs) {
        await reg.update().catch(() => {});
      }
    }
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => k.startsWith("resumora-shell-") && !k.includes("20260521-journey-v3"))
          .map((k) => caches.delete(k))
      );
    }
    sessionStorage.setItem(RS_SW_CLEARED_KEY, "1");
    logCheckoutRuntime("sw_cache_clear_done", { reason });
  } catch (e) {
    logCheckoutRuntime("sw_cache_clear_error", { message: e?.message });
  }
}
