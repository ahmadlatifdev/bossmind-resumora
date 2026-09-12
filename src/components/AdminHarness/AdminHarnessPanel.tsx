import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  addDoc,
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
} from 'firebase/firestore';
import { auth, db } from '../../lib/firebase';
import { sendMessage } from '../../lib/harness/harnessClient';
import { isMutatingTool, listAllowedTools } from '../../lib/harness/harnessToolRegistry';
import type { HarnessMessage, HarnessToolCall } from '../../lib/harness/harnessTypes';
import AdminMarkdown from '../AdminMarkdown';
import AdminHarnessToolbar from './AdminHarnessToolbar';

type AuditRow = {
  id: string;
  tool?: string;
  status?: string;
  actor?: string;
  createdAt?: string;
  resultSummary?: string;
};

type PendingMutation = {
  toolCalls: HarnessToolCall[];
  replyText: string;
  userText: string;
};

type Props = {
  password: string;
  lang?: string;
};

function sessionKeyForAdmin(): string {
  const uid = auth.currentUser?.uid;
  if (uid) return uid;
  try {
    const existing = sessionStorage.getItem('resumora_admin_harness_uid');
    if (existing) return existing;
    const next = `admin_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    sessionStorage.setItem('resumora_admin_harness_uid', next);
    return next;
  } catch {
    return `admin_${Date.now().toString(36)}`;
  }
}

export default function AdminHarnessPanel({ password }: Props) {
  const adminUid = useMemo(() => sessionKeyForAdmin(), []);
  const sessionId = `admin_${adminUid}`;
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<HarnessMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [pending, setPending] = useState<PendingMutation | null>(null);
  const [audit, setAudit] = useState<AuditRow[]>([]);
  const logRef = useRef<HTMLDivElement | null>(null);

  const persistMessage = useCallback(
    async (msg: HarnessMessage) => {
      try {
        await addDoc(collection(db, 'harness_sessions', adminUid, 'messages'), {
          ...msg,
          persistedAt: serverTimestamp(),
        });
      } catch {
        /* Firestore rules may block until Phase E — keep UI usable */
      }
    },
    [adminUid]
  );

  useEffect(() => {
    const q = query(
      collection(db, 'harness_sessions', adminUid, 'messages'),
      orderBy('createdAt', 'asc'),
      limit(100)
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const rows: HarnessMessage[] = snap.docs.map((d) => {
          const data = d.data() as HarnessMessage;
          return {
            id: data.id || d.id,
            role: data.role || 'assistant',
            content: String(data.content || ''),
            createdAt: String(data.createdAt || new Date().toISOString()),
            scope: 'admin',
            toolCalls: data.toolCalls,
            toolResults: data.toolResults,
            needsHuman: data.needsHuman,
          };
        });
        if (rows.length) setMessages(rows);
      },
      () => {
        /* ignore permission errors until rules land */
      }
    );
    return () => unsub();
  }, [adminUid]);

  useEffect(() => {
    const q = query(collection(db, 'harness_audit_log'), orderBy('createdAt', 'desc'), limit(25));
    const unsub = onSnapshot(
      q,
      (snap) => {
        setAudit(
          snap.docs.map((d) => {
            const data = d.data() as Record<string, unknown>;
            const createdAt =
              typeof data.createdAt === 'string'
                ? data.createdAt
                : data.createdAt &&
                    typeof (data.createdAt as { toDate?: () => Date }).toDate === 'function'
                  ? (data.createdAt as { toDate: () => Date }).toDate().toISOString()
                  : '';
            return {
              id: d.id,
              tool: String(data.tool || data.name || ''),
              status: String(data.status || ''),
              actor: String(data.actor || data.scope || 'admin'),
              createdAt,
              resultSummary: String(data.resultSummary || data.error || data.message || ''),
            };
          })
        );
      },
      () => setAudit([])
    );
    return () => unsub();
  }, []);

  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, pending, busy]);

  async function runSend(text: string) {
    const trimmed = String(text || '').trim();
    if (!trimmed || busy) return;
    setBusy(true);
    setError('');
    const userMsg: HarnessMessage = {
      id: `user_${Date.now()}`,
      role: 'user',
      content: trimmed,
      createdAt: new Date().toISOString(),
      scope: 'admin',
    };
    setMessages((prev) => [...prev, userMsg]);
    void persistMessage(userMsg);
    setInput('');

    try {
      const out = await sendMessage(sessionId, trimmed, 'admin', { password });
      if (!out.ok) throw new Error(out.error || 'Harness request failed');

      const replyText = String(out.reply || out.message?.content || '').trim() || '(empty reply)';
      const toolCalls = out.toolCalls || out.message?.toolCalls || [];
      const mutating = toolCalls.filter((c) => isMutatingTool(c.name));

      if (mutating.length) {
        setPending({ toolCalls: mutating, replyText, userText: trimmed });
      } else {
        const assistantMsg: HarnessMessage = {
          id: out.message?.id || `asst_${Date.now()}`,
          role: 'assistant',
          content: replyText,
          createdAt: new Date().toISOString(),
          scope: 'admin',
          toolCalls,
          toolResults: out.toolResults,
        };
        setMessages((prev) => [...prev, assistantMsg]);
        void persistMessage(assistantMsg);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Harness send failed');
    } finally {
      setBusy(false);
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void runSend(input);
  }

  function approvePending() {
    if (!pending) return;
    const assistantMsg: HarnessMessage = {
      id: `asst_${Date.now()}`,
      role: 'assistant',
      content: pending.replyText,
      createdAt: new Date().toISOString(),
      scope: 'admin',
      toolCalls: pending.toolCalls,
    };
    setMessages((prev) => [...prev, assistantMsg]);
    void persistMessage(assistantMsg);
    setPending(null);
  }

  function rejectPending() {
    setPending(null);
  }

  const allowedMutations = listAllowedTools('admin').filter((n) => isMutatingTool(n));

  return (
    <section className="admin-master__card admin-harness-panel" aria-label="Admin Harness">
      <header className="admin-harness-panel__header">
        <h2>Admin Harness</h2>
        <p className="admin-master__lead">
          Privileged natural-language control. Mutations require review. Session:{' '}
          <code>{adminUid}</code>
        </p>
      </header>

      <AdminHarnessToolbar disabled={busy} onAction={(prompt) => void runSend(prompt)} />

      <div className="admin-harness-panel__log" ref={logRef} role="log" aria-live="polite">
        {messages.length === 0 ? (
          <p className="admin-harness-message admin-harness-message--system">
            Ask the harness to fix a build, run health, or update docs. Allowed mutation tools:{' '}
            {allowedMutations.join(', ')}.
          </p>
        ) : null}
        {messages.map((m) => (
          <article key={m.id} className={`admin-harness-message admin-harness-message--${m.role}`}>
            <header>
              <strong>{m.role}</strong>
              <span>{m.createdAt}</span>
            </header>
            <AdminMarkdown text={m.content} />
            {m.toolCalls?.length ? (
              <p className="admin-harness-message__tools">
                tools: {m.toolCalls.map((c) => c.name).join(', ')}
              </p>
            ) : null}
          </article>
        ))}
      </div>

      {pending ? (
        <div className="admin-harness-pending-card" role="dialog" aria-label="Pending changes">
          <h3>Pending Changes</h3>
          <p>Review mutating tools before applying (registry-gated):</p>
          <ul>
            {pending.toolCalls.map((c) => (
              <li key={c.id || c.name}>
                <code>{c.name}</code>
                {c.args ? <pre>{JSON.stringify(c.args, null, 2)}</pre> : null}
              </li>
            ))}
          </ul>
          <div className="admin-harness-pending-card__preview">
            <AdminMarkdown text={pending.replyText} />
          </div>
          <div className="admin-harness-pending-card__actions">
            <button type="button" className="admin-master__btn" onClick={approvePending}>
              Approve
            </button>
            <button
              type="button"
              className="admin-master__btn admin-master__btn--ghost"
              onClick={rejectPending}
            >
              Reject
            </button>
          </div>
        </div>
      ) : null}

      {error ? (
        <p className="admin-master__alert" role="alert">
          {error}
        </p>
      ) : null}

      <form className="admin-harness-panel__composer" onSubmit={onSubmit}>
        <label className="admin-harness-panel__label" htmlFor="admin-harness-input">
          Message
        </label>
        <textarea
          id="admin-harness-input"
          className="admin-harness-panel__input"
          rows={3}
          value={input}
          disabled={busy}
          placeholder="e.g. Run a health check and summarize findings"
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void runSend(input);
            }
          }}
        />
        <button type="submit" className="admin-master__btn" disabled={busy || !input.trim()}>
          {busy ? 'Sending…' : 'Send'}
        </button>
      </form>

      <aside className="admin-harness-panel__audit" aria-label="Harness audit log">
        <h3>Audit log</h3>
        {audit.length === 0 ? (
          <p className="admin-master__lead">No audit entries yet (backend Phase D/E).</p>
        ) : (
          <ul>
            {audit.map((row) => (
              <li key={row.id}>
                <strong>{row.tool || '—'}</strong> · {row.status || '—'} · {row.actor || 'admin'}
                {row.createdAt ? ` · ${row.createdAt}` : ''}
                {row.resultSummary ? (
                  <span className="admin-harness-panel__audit-result"> — {row.resultSummary}</span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </aside>
    </section>
  );
}
