/**
 * Unified harness API client — admin and client scopes.
 * Admin calls should pass password for X-Admin-Password.
 */

import { readAdminPassword } from '../adminApi';
import type { HarnessScope, HarnessSendPayload, HarnessSendResponse } from './harnessTypes';

function harnessUrl(scope: HarnessScope): string {
  return `/api/harness/${scope === 'admin' ? 'admin' : 'client'}`;
}

function buildHeaders(scope: HarnessScope, password?: string): HeadersInit {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json, text/plain, text/event-stream',
  };
  if (scope === 'admin') {
    const pw = String(password || readAdminPassword() || '').trim();
    if (pw) headers['X-Admin-Password'] = pw;
  }
  return headers;
}

/**
 * Send a harness message. Prefer streaming when the server returns text/event-stream;
 * otherwise fall back to a JSON reply body.
 */
export async function sendMessage(
  sessionId: string,
  message: string,
  scope: HarnessScope,
  options?: { password?: string; signal?: AbortSignal; onChunk?: (text: string) => void }
): Promise<HarnessSendResponse> {
  const payload: HarnessSendPayload = {
    sessionId: String(sessionId || '').trim(),
    message: String(message || '').trim(),
    scope,
  };
  if (!payload.sessionId) throw new Error('sessionId is required');
  if (!payload.message) throw new Error('message is required');

  const res = await fetch(harnessUrl(scope), {
    method: 'POST',
    headers: buildHeaders(scope, options?.password),
    body: JSON.stringify(payload),
    signal: options?.signal,
  });

  const contentType = String(res.headers.get('content-type') || '');

  if (contentType.includes('text/event-stream') && res.body) {
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let assembled = '';
    let buffer = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split('\n');
      buffer = parts.pop() || '';
      for (const line of parts) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        const data = trimmed.slice(5).trim();
        if (!data || data === '[DONE]') continue;
        try {
          const parsed = JSON.parse(data) as { text?: string; reply?: string };
          const chunk = String(parsed.text || parsed.reply || '');
          if (chunk) {
            assembled += chunk;
            options?.onChunk?.(chunk);
          }
        } catch {
          assembled += data;
          options?.onChunk?.(data);
        }
      }
    }
    if (!res.ok) {
      return { ok: false, sessionId: payload.sessionId, error: assembled || `HTTP ${res.status}` };
    }
    return {
      ok: true,
      sessionId: payload.sessionId,
      reply: assembled,
      message: {
        id: `asst_${Date.now()}`,
        role: 'assistant',
        content: assembled,
        createdAt: new Date().toISOString(),
        scope,
      },
    };
  }

  const data = (await res.json().catch(() => ({}))) as HarnessSendResponse;
  if (!res.ok) {
    return {
      ok: false,
      sessionId: payload.sessionId,
      error: data.error || `HTTP ${res.status}`,
    };
  }
  if (data.reply && options?.onChunk) options.onChunk(data.reply);
  return { ok: true, sessionId: payload.sessionId, ...data };
}

export const harnessClient = {
  sendMessage,
};

export default harnessClient;
