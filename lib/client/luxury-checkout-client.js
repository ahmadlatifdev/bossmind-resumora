/**
 * Client-side luxury checkout activation — single-flight, one silent retry, hard cap.
 */

export const LUXURY_CHECKOUT_TIMEOUT_MS = 22000;
export const LUXURY_CHECKOUT_MIN_PREPARE_MS = 3200;
const FIRST_ATTEMPT_MS = 11000;
const RETRY_ATTEMPT_MS = 8000;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchCheckoutComplete(sessionId, lang, { signal, attempt = 1 } = {}) {
  const qs = new URLSearchParams({ lang, session_id: sessionId, attempt: String(attempt) });
  const res = await fetch(`/api/client/checkout-complete?${qs.toString()}`, {
    credentials: "same-origin",
    signal,
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, data };
}

/**
 * Run activation with at most two attempts (second is silent server+client retry).
 */
export async function runLuxuryCheckoutActivation(sessionId, lang, { signal: outerSignal } = {}) {
  const startedAt = Date.now();
  const sid = String(sessionId || "").trim();
  if (!sid) {
    return { status: "failed", data: null, attempts: 0 };
  }

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
    if (isActivationComplete(last.data)) {
      return finishSuccess(last.data, startedAt, attempts);
    }
    if (last.data?.activationStatus === "needs_sign_in" || last.data?.needsSignIn) {
      return { status: "needs_sign_in", data: last.data, attempts };
    }
    if (last.data?.activationStatus === "email_mismatch" || last.data?.failedStep === "auth_email_mismatch") {
      return { status: "email_mismatch", data: last.data, attempts };
    }

    if (Date.now() - startedAt < LUXURY_CHECKOUT_TIMEOUT_MS - 2000) {
      await sleep(600);
      last = await runAttempt(2, RETRY_ATTEMPT_MS);
      attempts = 2;
      if (isActivationComplete(last.data)) {
        return finishSuccess(last.data, startedAt, attempts);
      }
      if (last.data?.activationStatus === "needs_sign_in" || last.data?.needsSignIn) {
        return { status: "needs_sign_in", data: last.data, attempts };
      }
      if (last.data?.activationStatus === "email_mismatch" || last.data?.failedStep === "auth_email_mismatch") {
        return { status: "email_mismatch", data: last.data, attempts };
      }
    }
  } catch (e) {
    if (e?.name === "AbortError" && outerSignal?.aborted) {
      return { status: "aborted", data: last.data, attempts };
    }
  }

  const elapsed = Date.now() - startedAt;
  if (elapsed < LUXURY_CHECKOUT_MIN_PREPARE_MS) {
    await sleep(LUXURY_CHECKOUT_MIN_PREPARE_MS - elapsed);
  }

  if (last.data?.activationStatus === "email_mismatch" || last.data?.failedStep === "auth_email_mismatch") {
    return { status: "email_mismatch", data: last.data, attempts };
  }

  if (last.data?.needsSignIn || last.data?.activationStatus === "needs_sign_in") {
    return { status: "needs_sign_in", data: last.data, attempts };
  }

  return { status: "needs_sign_in", data: last.data, attempts };
}

function isActivationComplete(data) {
  return (
    data?.activationSuccess === true ||
    (data?.activationStatus === "complete" && data?.hasAccess === true)
  );
}

async function finishSuccess(data, startedAt, attempts) {
  const elapsed = Date.now() - startedAt;
  if (elapsed < LUXURY_CHECKOUT_MIN_PREPARE_MS) {
    await sleep(LUXURY_CHECKOUT_MIN_PREPARE_MS - elapsed);
  }
  return { status: "complete", data, attempts };
}
