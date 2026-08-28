/**
 * Frontend structured logging + optional remote error report.
 * Never sends secrets, tokens, or full env values.
 */
const REPORT_URL = '/api/client-error';

export function clientLog(level, scope, payload = {}) {
  const entry = {
    ts: new Date().toISOString(),
    scope: String(scope || 'app'),
    ...payload,
  };
  const line = JSON.stringify(entry);
  if (level === 'error') console.error(`[resumora] ${line}`);
  else if (level === 'warn') console.warn(`[resumora] ${line}`);
  else console.info(`[resumora] ${line}`);
}

export function reportClientError(error, extra = {}) {
  const message =
    (error && error.message) || (typeof error === 'string' ? error : 'unknown_client_error');
  clientLog('error', 'client', { message: String(message).slice(0, 400), ...extra });
  try {
    const body = JSON.stringify({
      message: String(message).slice(0, 400),
      path: typeof window !== 'undefined' ? window.location.pathname : '',
      level: 'error',
      ...extra,
    });
    if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
      const blob = new Blob([body], { type: 'application/json' });
      navigator.sendBeacon(REPORT_URL, blob);
      return;
    }
    void fetch(REPORT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
    }).catch(() => {});
  } catch (_) {
    /* ignore */
  }
}

export function installGlobalErrorReporting() {
  if (typeof window === 'undefined') return;
  if (window.__resumoraErrorHooks) return;
  window.__resumoraErrorHooks = true;
  window.addEventListener('error', (ev) => {
    reportClientError(ev.error || ev.message, { source: 'window.error' });
  });
  window.addEventListener('unhandledrejection', (ev) => {
    reportClientError(ev.reason, { source: 'unhandledrejection' });
  });
}
