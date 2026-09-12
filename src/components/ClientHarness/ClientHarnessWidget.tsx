import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import * as harnessClient from '../../lib/harness/harnessClient';
import type { HarnessMessage } from '../../lib/harness/harnessTypes';
import ClientHarnessEscalation from './ClientHarnessEscalation';

const SESSION_KEY = 'resumora_client_harness_session';
const RATE_KEY = 'resumora_client_harness_rate';
const MAX_MESSAGES_PER_HOUR = 20;
const HOUR_MS = 60 * 60 * 1000;

type ChatLine = {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
};

function getOrCreateSessionId(): string {
  try {
    const existing = sessionStorage.getItem(SESSION_KEY);
    if (existing) return existing;
    const next = `client_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    sessionStorage.setItem(SESSION_KEY, next);
    return next;
  } catch {
    return `client_${Date.now().toString(36)}`;
  }
}

function readRateTimestamps(): number[] {
  try {
    const raw = sessionStorage.getItem(RATE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const now = Date.now();
    return parsed.map((n) => Number(n)).filter((n) => Number.isFinite(n) && now - n < HOUR_MS);
  } catch {
    return [];
  }
}

function recordSendTimestamp(): { ok: boolean; remaining: number } {
  const now = Date.now();
  const recent = readRateTimestamps();
  if (recent.length >= MAX_MESSAGES_PER_HOUR) {
    return { ok: false, remaining: 0 };
  }
  const next = [...recent, now];
  try {
    sessionStorage.setItem(RATE_KEY, JSON.stringify(next));
  } catch {
    /* ignore quota */
  }
  return { ok: true, remaining: MAX_MESSAGES_PER_HOUR - next.length };
}

function responseNeedsEscalation(out: {
  needsHuman?: boolean;
  escalate?: boolean;
  message?: HarnessMessage & { escalate?: boolean };
  reply?: string;
  [key: string]: unknown;
}): boolean {
  if (out.needsHuman === true || out.escalate === true) return true;
  if (out.message?.needsHuman === true || out.message?.escalate === true) return true;
  const blob = `${out.reply || ''}\n${out.message?.content || ''}`.toLowerCase();
  if (blob.includes('"needs_human":true') || blob.includes('"needs_human": true')) return true;
  if (blob.includes('"escalate":true') || blob.includes('"escalate": true')) return true;
  if (/\bneeds_human\s*:\s*true\b/i.test(blob) || /\bescalate\s*:\s*true\b/i.test(blob)) {
    return true;
  }
  return false;
}

export default function ClientHarnessWidget() {
  const sessionId = useMemo(() => getOrCreateSessionId(), []);
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [lines, setLines] = useState<ChatLine[]>([]);
  const [escalateOpen, setEscalateOpen] = useState(false);
  const [escalateSummary, setEscalateSummary] = useState('');
  const logRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines, open]);

  async function runSend(text: string) {
    const trimmed = String(text || '').trim();
    if (!trimmed || busy) return;

    const rate = recordSendTimestamp();
    if (!rate.ok) {
      setError('Rate limit reached (20 messages/hour). Please try again later.');
      return;
    }

    setBusy(true);
    setError('');
    const userLine: ChatLine = {
      id: `u_${Date.now()}`,
      role: 'user',
      content: trimmed,
    };
    setLines((prev) => [...prev, userLine]);
    setInput('');

    try {
      const out = await harnessClient.sendMessage(sessionId, trimmed, 'client');
      if (!out.ok) throw new Error(out.error || 'Harness request failed');

      const replyText =
        String(out.reply || out.message?.content || '').trim() ||
        'Thanks — we received your message.';
      const assistantLine: ChatLine = {
        id: out.message?.id || `a_${Date.now()}`,
        role: 'assistant',
        content: replyText,
      };
      setLines((prev) => [...prev, assistantLine]);

      if (responseNeedsEscalation(out)) {
        const context = [...lines, userLine, assistantLine]
          .slice(-6)
          .map((l) => `${l.role}: ${l.content}`)
          .join('\n');
        setEscalateSummary(context.slice(0, 1200));
        setEscalateOpen(true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send message');
    } finally {
      setBusy(false);
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void runSend(input);
  }

  return (
    <div className="client-harness-root" aria-live="polite">
      {open ? (
        <div className="client-harness-window" role="dialog" aria-label="Support chat">
          <header className="client-harness-window__header">
            <div>
              <strong>Resumora Help</strong>
              <p>Ask about your plan, videos, or account.</p>
            </div>
            <button
              type="button"
              className="client-harness-window__close"
              aria-label="Close chat"
              onClick={() => setOpen(false)}
            >
              ×
            </button>
          </header>

          <div className="client-harness-window__log" ref={logRef}>
            {lines.length === 0 ? (
              <p className="client-harness-window__empty">
                Hi — how can we help? (Max {MAX_MESSAGES_PER_HOUR} messages/hour)
              </p>
            ) : null}
            {lines.map((line) => (
              <article
                key={line.id}
                className={`client-harness-msg client-harness-msg--${line.role}`}
              >
                {line.content}
              </article>
            ))}
          </div>

          {error ? (
            <p className="client-harness-window__error" role="alert">
              {error}
            </p>
          ) : null}

          <form className="client-harness-window__composer" onSubmit={onSubmit}>
            <label className="visually-hidden" htmlFor="client-harness-input">
              Message
            </label>
            <textarea
              id="client-harness-input"
              rows={2}
              value={input}
              disabled={busy}
              placeholder="Type your question…"
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void runSend(input);
                }
              }}
            />
            <button type="submit" disabled={busy || !input.trim()}>
              {busy ? '…' : 'Send'}
            </button>
          </form>

          <button
            type="button"
            className="client-harness-window__escalate"
            onClick={() => {
              setEscalateSummary(
                lines
                  .slice(-6)
                  .map((l) => `${l.role}: ${l.content}`)
                  .join('\n')
                  .slice(0, 1200)
              );
              setEscalateOpen(true);
            }}
          >
            Talk to a human
          </button>
        </div>
      ) : null}

      <button
        type="button"
        className="client-harness-bubble"
        aria-label={open ? 'Hide support chat' : 'Open support chat'}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {open ? '×' : '?'}
      </button>

      {escalateOpen ? (
        <ClientHarnessEscalation
          sessionId={sessionId}
          initialSummary={escalateSummary}
          onClose={() => setEscalateOpen(false)}
        />
      ) : null}
    </div>
  );
}
