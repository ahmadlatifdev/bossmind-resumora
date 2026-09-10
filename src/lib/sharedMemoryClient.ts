/**
 * Client helpers for Shared Memory errors + BossMind Manual.
 * Logging uses the public ingest rewrite (redacted server-side).
 */
import { adminHeaders, readAdminPassword } from './adminApi';

export type SystemErrorRow = {
  id?: string;
  message?: string;
  stack?: string | null;
  source?: string;
  url?: string | null;
  path?: string | null;
  severity?: string;
  context?: string;
  userAgent?: string | null;
  createdAt?: string | null;
};

export type BossMindManualDoc = {
  id?: string;
  title?: string;
  content?: string;
  updatedAt?: string | null;
  version?: number;
};

let lastLoggedKey = '';
let lastLoggedAt = 0;

export async function reportSharedMemoryError(input: {
  message: string;
  stack?: string;
  source?: string;
  url?: string;
  path?: string;
  severity?: string;
  context?: unknown;
}): Promise<void> {
  const message = String(input.message || '').trim();
  if (!message) return;

  // Deduplicate identical bursts (StrictMode double-fire, retry loops).
  const key = `${input.source || ''}|${message.slice(0, 200)}`;
  const now = Date.now();
  if (key === lastLoggedKey && now - lastLoggedAt < 8000) return;
  lastLoggedKey = key;
  lastLoggedAt = now;

  try {
    await fetch('/api/shared-memory/errors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message,
        stack: input.stack,
        source: input.source || 'frontend',
        url: input.url || (typeof window !== 'undefined' ? window.location.href : ''),
        path: input.path || (typeof window !== 'undefined' ? window.location.pathname : ''),
        severity: input.severity || 'error',
        context: input.context,
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
      }),
      keepalive: true,
    });
  } catch {
    /* never throw from the logger */
  }
}

export function installGlobalErrorHandler(source = 'frontend') {
  if (typeof window === 'undefined') return () => undefined;
  const w = window as Window & { __bossmindErrorHandlerInstalled?: boolean };
  if (w.__bossmindErrorHandlerInstalled) return () => undefined;
  w.__bossmindErrorHandlerInstalled = true;

  const onError = (event: ErrorEvent) => {
    void reportSharedMemoryError({
      message: event.message || 'window.onerror',
      stack: event.error?.stack,
      source,
      severity: 'error',
      context: { filename: event.filename, lineno: event.lineno, colno: event.colno },
    });
  };

  const onRejection = (event: PromiseRejectionEvent) => {
    const reason = event.reason;
    const message =
      reason instanceof Error
        ? reason.message
        : typeof reason === 'string'
          ? reason
          : 'unhandledrejection';
    void reportSharedMemoryError({
      message,
      stack: reason instanceof Error ? reason.stack : undefined,
      source,
      severity: 'error',
      context: { type: 'unhandledrejection' },
    });
  };

  window.addEventListener('error', onError);
  window.addEventListener('unhandledrejection', onRejection);

  return () => {
    window.removeEventListener('error', onError);
    window.removeEventListener('unhandledrejection', onRejection);
    w.__bossmindErrorHandlerInstalled = false;
  };
}

/** Wrap fetch to log non-OK API responses (best-effort). */
export function installFetchErrorLogger(source = 'frontend') {
  if (typeof window === 'undefined' || typeof window.fetch !== 'function') {
    return () => undefined;
  }
  const w = window as Window & { __bossmindFetchLoggerInstalled?: boolean; fetch: typeof fetch };
  if (w.__bossmindFetchLoggerInstalled) return () => undefined;
  w.__bossmindFetchLoggerInstalled = true;
  const original = window.fetch.bind(window);

  window.fetch = async (...args: Parameters<typeof fetch>) => {
    try {
      const res = await original(...args);
      if (!res.ok && res.status >= 500) {
        const url =
          typeof args[0] === 'string'
            ? args[0]
            : args[0] instanceof Request
              ? args[0].url
              : String(args[0]);
        // Avoid recursive logging of the error ingest itself.
        if (!String(url).includes('/api/shared-memory/errors')) {
          void reportSharedMemoryError({
            message: `API ${res.status} ${res.statusText || ''}`.trim(),
            source,
            severity: res.status >= 500 ? 'error' : 'warn',
            context: { url, status: res.status },
          });
        }
      }
      return res;
    } catch (err) {
      const url =
        typeof args[0] === 'string'
          ? args[0]
          : args[0] instanceof Request
            ? args[0].url
            : String(args[0]);
      if (!String(url).includes('/api/shared-memory/errors')) {
        void reportSharedMemoryError({
          message: err instanceof Error ? err.message : 'fetch failed',
          stack: err instanceof Error ? err.stack : undefined,
          source,
          severity: 'error',
          context: { url },
        });
      }
      throw err;
    }
  };

  return () => {
    window.fetch = original;
    w.__bossmindFetchLoggerInstalled = false;
  };
}

export async function fetchSharedMemoryErrors(password?: string, limit = 50) {
  const pw = password || readAdminPassword();
  const res = await fetch(
    `/api/admin/shared-memory/errors?limit=${encodeURIComponent(String(limit))}`,
    {
      cache: 'no-store',
      headers: {
        ...adminHeaders(pw),
        'Cache-Control': 'no-cache',
      },
    }
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data as { ok?: boolean; count?: number; errors?: SystemErrorRow[] };
}

export async function fetchBossMindManual(password?: string) {
  const pw = password || readAdminPassword();
  const res = await fetch('/api/admin/manual', {
    cache: 'no-store',
    headers: { ...adminHeaders(pw), 'Cache-Control': 'no-cache' },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data as { ok?: boolean; manual?: BossMindManualDoc; seeded?: boolean };
}

export async function saveBossMindManual(
  password: string,
  patch: { title?: string; content?: string }
) {
  const res = await fetch('/api/admin/manual', {
    method: 'PUT',
    headers: {
      ...adminHeaders(password),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(patch),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data as { ok?: boolean; manual?: BossMindManualDoc };
}
