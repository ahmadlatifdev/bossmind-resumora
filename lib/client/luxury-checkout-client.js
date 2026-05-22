/**
 * Client-side luxury checkout activation — single-flight, hard UI cap, recovery outcomes.
 */

import { logCheckoutRuntime } from "@/lib/client/checkout-runtime";

export const STUDIO_UI_HARD_TIMEOUT_MS = 8000;
export const LUXURY_CHECKOUT_TIMEOUT_MS = STUDIO_UI_HARD_TIMEOUT_MS;
const FIRST_ATTEMPT_MS = 5500;
const RETRY_ATTEMPT_MS = 2500;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchCheckoutComplete(sessionId, lang, { signal, attempt = 1 } = {}) {
  const qs = new URLSearchParams({ lang, session_id: sessionId, attempt: String(attempt) });
  const res = await fetch(`/api/client/checkout-complete?${qs.toString()}`, {
    credentials: "same-origin",
    signal,
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, data };
}

/**
 * Run activation once server-side (checkout-complete), with at most one silent retry inside the hard cap.
 */
export async function runLuxuryCheckoutActivation(sessionId, lang, { signal: outerSignal } = {}) {
  const startedAt = Date.now();
  const sid = String(sessionId || "").trim();
  if (!sid) {
    return { status: "recovery", data: { failedStep: "missing_session_id" }, attempts: 0 };
  }

  logCheckoutRuntime("studio_activation_start", { sessionIdPrefix: sid.slice(0, 20) });

  const runAttempt = async (attemptNum, budgetMs) => {
    const ac = new AbortController();
    const linkAbort = () => ac.abort();
    outerSignal?.addEventListener("abort", linkAbort, { once: true });
    const t = setTimeout(() => ac.abort(), budgetMs);
    try {
      return await fetchCheckoutComplete(sid, lang, { signal: ac.signal, attempt: attemptNum });
    } finally {
      clearTimeout(t);
      outerSignal?.removeEventListener("abort", linkAbort);
    }
  };

  let last = { ok: false, data: {} };
  let attempts = 0;

  try {
    last = await runAttempt(1, FIRST_ATTEMPT_MS);
    attempts = 1;
    logCheckoutRuntime("studio_activation_attempt", {
      attempt: 1,
      activationStatus: last.data?.activationStatus,
      failedStep: last.data?.failedStep,
    });

    const early = classifyOutcome(last.data, attempts);
    if (early) return early;

    if (Date.now() - startedAt < LUXURY_CHECKOUT_TIMEOUT_MS - 1500) {
      await sleep(400);
      last = await runAttempt(2, RETRY_ATTEMPT_MS);
      attempts = 2;
      logCheckoutRuntime("studio_activation_attempt", {
        attempt: 2,
        activationStatus: last.data?.activationStatus,
        failedStep: last.data?.failedStep,
      });
      const second = classifyOutcome(last.data, attempts);
      if (second) return second;
    }
  } catch (e) {
    if (e?.name === "AbortError" && outerSignal?.aborted) {
      logCheckoutRuntime("studio_activation_aborted", { attempts });
      return { status: "timeout", data: last.data, attempts };
    }
    logCheckoutRuntime("studio_activation_error", { message: e?.message, attempts });
  }

  if (Date.now() - startedAt >= STUDIO_UI_HARD_TIMEOUT_MS) {
    return { status: "timeout", data: last.data, attempts };
  }

  return classifyOutcome(last.data, attempts) || { status: "recovery", data: last.data, attempts };
}

function classifyOutcome(data, attempts) {
  if (isActivationComplete(data)) {
    logCheckoutRuntime("studio_unlocked", {
      planId: data?.planId,
      attempts,
    });
    return { status: "complete", data, attempts };
  }

  if (data?.activationStatus === "email_mismatch" || data?.failedStep === "auth_email_mismatch") {
    return { status: "email_mismatch", data, attempts };
  }

  if (needsClientSignIn(data)) {
    logCheckoutRuntime("studio_needs_sign_in", { attempts, failedStep: data?.failedStep });
    return { status: "needs_sign_in", data, attempts };
  }

  if (
    data?.recoveryRequired === true ||
    data?.activationStatus === "recovery_required" ||
    data?.sessionInvalid === true ||
    data?.failedStep === "payment_not_paid" ||
    data?.failedStep === "stripe_lookup_failed" ||
    data?.failedStep === "stripe_unconfigured"
  ) {
    logCheckoutRuntime("studio_recovery_required", {
      attempts,
      failedStep: data?.failedStep,
      activationStatus: data?.activationStatus,
    });
    return { status: "recovery", data, attempts };
  }

  if (data?.signedIn === true && !data?.activationSuccess) {
    return { status: "activation_pending", data, attempts };
  }

  return null;
}

function needsClientSignIn(data) {
  if (!data) return true;
  if (data.signedIn === true) return false;
  return data.needsSignIn === true || data.activationStatus === "needs_sign_in";
}

function isActivationComplete(data) {
  return (
    data?.activationSuccess === true ||
    (data?.activationStatus === "complete" && data?.hasAccess === true)
  );
}
