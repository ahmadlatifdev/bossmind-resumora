/**
 * Client-side helpers for silent post-checkout sync (no UI state churn).
 */

const MAX_SILENT_ATTEMPTS = 8;
const BASE_BACKOFF_MS = 900;
const MAX_BACKOFF_MS = 12000;

function backoffMs(attempt) {
  return Math.min(MAX_BACKOFF_MS, BASE_BACKOFF_MS * 2 ** attempt);
}

function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const id = setTimeout(resolve, ms);
    if (signal) {
      signal.addEventListener(
        "abort",
        () => {
          clearTimeout(id);
          reject(new DOMException("Aborted", "AbortError"));
        },
        { once: true }
      );
    }
  });
}

async function fetchBootstrap(sessionId, lang, signal) {
  const qs = new URLSearchParams({ lang, session_id: sessionId });
  let res = await fetch(`/api/client/checkout-bootstrap?${qs}`, {
    credentials: "same-origin",
    signal,
  });
  if (res.status === 404) {
    await fetch(`/api/client/activate-plan?session_id=${encodeURIComponent(sessionId)}&lang=${lang}`, {
      credentials: "same-origin",
      signal,
    }).catch(() => {});
    res = await fetch(`/api/client/workspace?${qs}`, { credentials: "same-origin", signal });
  }
  if (!res.ok) return { ok: false };
  const data = await res.json();
  return { ok: Boolean(data.hasAccess), data };
}

/**
 * Silent retry until access or attempts exhausted.
 */
async function silentCheckoutSync(sessionId, lang, { signal, onAttempt } = {}) {
  if (!sessionId) return { ok: false, data: null, attempts: 0 };

  let first = await fetchBootstrap(sessionId, lang, signal);
  if (first.ok) return { ok: true, data: first.data, attempts: 1 };

  for (let attempt = 1; attempt < MAX_SILENT_ATTEMPTS; attempt++) {
    if (signal?.aborted) return { ok: false, data: null, attempts: attempt, aborted: true };
    onAttempt?.(attempt + 1);
    await sleep(backoffMs(attempt), signal);
    first = await fetchBootstrap(sessionId, lang, signal);
    if (first.ok) return { ok: true, data: first.data, attempts: attempt + 1 };
  }

  return { ok: false, data: first.data, attempts: MAX_SILENT_ATTEMPTS };
}

export { MAX_SILENT_ATTEMPTS, backoffMs, silentCheckoutSync, fetchBootstrap };
