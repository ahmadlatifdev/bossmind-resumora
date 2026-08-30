import { useState, type FormEvent } from 'react';
import { useAuth } from '../auth/AuthContext';
import { useLangOptional } from '../i18n/LangContext';
import { t } from '../lib/i18n.js';
import './ClientChat.css';

type ChatLine = { role: 'user' | 'support'; text: string };

const QUICK = [
  { intent: 'refund', key: 'chat.quick.payments' },
  { intent: 'studio', key: 'chat.quick.studio' },
  { intent: 'video', key: 'chat.quick.videos' },
  { intent: 'human', key: 'chat.quick.human' },
] as const;

/**
 * Paid-member Client Chat FAB. Hidden when not signed in or subscription inactive.
 */
export default function ClientChat() {
  const { lang } = useLangOptional();
  const { user, loading, subscriptionActive } = useAuth();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [lines, setLines] = useState<ChatLine[]>([]);

  if (loading || !user || !subscriptionActive) {
    return null;
  }

  function closePanel() {
    setOpen(false);
    setDraft('');
    setSending(false);
  }

  async function postMessage(text: string, intentHint?: string) {
    const token = await user.getIdToken();
    const res = await fetch('/api/chat/message', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ message: text, lang, intent: intentHint || '' }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return String(data.reply || t(lang, 'chat.fallback'));
  }

  async function submitText(text: string, intentHint?: string) {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    setSending(true);
    setLines((prev) => [...prev, { role: 'user', text: trimmed }]);
    setDraft('');
    try {
      const reply = await postMessage(trimmed, intentHint);
      setLines((prev) => [...prev, { role: 'support', text: reply }]);
    } catch {
      setLines((prev) => [...prev, { role: 'support', text: t(lang, 'chat.sendFailed') }]);
    } finally {
      setSending(false);
    }
  }

  async function onSend(e: FormEvent) {
    e.preventDefault();
    await submitText(draft);
  }

  return (
    <div className="client-chat" data-ssot="client-chat">
      {open ? (
        <section className="client-chat__panel" role="dialog" aria-labelledby="client-chat-title">
          <header className="client-chat__header">
            <h2 id="client-chat-title">{t(lang, 'chat.title')}</h2>
            <div className="client-chat__header-actions">
              <button type="button" className="client-chat__cancel" onClick={closePanel}>
                {t(lang, 'chat.cancel')}
              </button>
              <button
                type="button"
                className="client-chat__close"
                onClick={closePanel}
                aria-label={t(lang, 'chat.close')}
              >
                ×
              </button>
            </div>
          </header>
          <p className="client-chat__welcome">{t(lang, 'chat.welcome')}</p>
          <a className="client-chat__history" href="/account">
            {t(lang, 'chat.viewPaymentHistory')}
          </a>
          <div className="client-chat__quick" role="group" aria-label={t(lang, 'chat.quickAria')}>
            {QUICK.map((q) => (
              <button
                key={q.intent}
                type="button"
                className="client-chat__chip"
                disabled={sending}
                onClick={() => void submitText(t(lang, q.key), q.intent)}
              >
                {t(lang, q.key)}
              </button>
            ))}
          </div>
          <div className="client-chat__thread" aria-live="polite">
            {lines.map((line, i) => (
              <p
                key={`${line.role}-${i}`}
                className={
                  line.role === 'user'
                    ? 'client-chat__bubble client-chat__bubble--user'
                    : 'client-chat__bubble'
                }
              >
                {line.text}
              </p>
            ))}
            {sending ? (
              <p className="client-chat__typing" role="status">
                <span className="client-chat__dots" aria-hidden="true">
                  <i />
                  <i />
                  <i />
                </span>
                {t(lang, 'chat.typing')}
              </p>
            ) : null}
          </div>
          <form className="client-chat__form" onSubmit={onSend}>
            <label className="sr-only" htmlFor="client-chat-input">
              {t(lang, 'chat.placeholder')}
            </label>
            <textarea
              id="client-chat-input"
              rows={3}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={t(lang, 'chat.placeholder')}
              disabled={sending}
            />
            <button type="submit" className="primary" disabled={sending}>
              {sending ? t(lang, 'chat.sending') : t(lang, 'chat.send')}
            </button>
          </form>
        </section>
      ) : null}
      <button
        type="button"
        className="client-chat__fab"
        onClick={() => setOpen((v) => !v)}
        aria-label={t(lang, 'chat.fabLabel')}
        title={t(lang, 'chat.fabTitle')}
      >
        {t(lang, 'chat.fabLabel')}
      </button>
    </div>
  );
}
