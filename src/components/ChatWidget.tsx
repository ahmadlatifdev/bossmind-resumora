import { FormEvent, useCallback, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { auth } from '../lib/firebase';
import { getLang, t } from '../lib/i18n.js';

const CHAT_URL = '/api/chat/send';
const PAYMENT_HISTORY_HREF = '/account#transactions';

type ChatLine = {
  id: string;
  role: 'user' | 'system';
  text: string;
};

/**
 * Floating Client Chat — paid members only.
 * Renders nothing when signed out or subscription is inactive.
 * SupportChat re-exports this component.
 */
export default function ChatWidget() {
  const { user, loading, subscriptionActive } = useAuth();
  const [open, setOpen] = useState(false);
  const [lang] = useState(() => getLang());
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [lines, setLines] = useState<ChatLine[]>([]);

  const send = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      if (!subscriptionActive || !user) {
        setError(t(lang, 'chat.membersOnly'));
        return;
      }
      const text = draft.trim();
      if (!text || busy) return;
      setBusy(true);
      setError('');
      const optimistic: ChatLine = {
        id: `local_${Date.now()}`,
        role: 'user',
        text,
      };
      setLines((prev) => [...prev, optimistic]);
      setDraft('');
      try {
        const token = await auth.currentUser?.getIdToken();
        if (!token) throw new Error(t(lang, 'chat.sendFailed'));
        const res = await fetch(CHAT_URL, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ message: text, locale: lang }),
        });
        const data = await res.json().catch(() => ({}));
        if (res.status === 403) {
          setError(t(lang, 'chat.membersOnly'));
          setLines((prev) => [
            ...prev,
            {
              id: `sys_${Date.now()}`,
              role: 'system',
              text: t(lang, 'chat.upgradePrompt'),
            },
          ]);
          return;
        }
        if (!res.ok) throw new Error(data.error || t(lang, 'chat.sendFailed'));
        setLines((prev) => [
          ...prev,
          {
            id: String(data.id || `sys_${Date.now()}`),
            role: 'system',
            text: data.reply || t(lang, 'chat.received'),
          },
        ]);
      } catch (err) {
        setError(err instanceof Error ? err.message : t(lang, 'chat.sendFailed'));
      } finally {
        setBusy(false);
      }
    },
    [busy, draft, lang, subscriptionActive, user]
  );

  // Strict: hide completely for guests and inactive plans.
  if (loading || !user || !subscriptionActive) {
    return null;
  }

  return (
    <div className="chat-widget" aria-live="polite">
      {open ? (
        <div className="chat-widget-panel" role="dialog" aria-label={t(lang, 'chat.title')}>
          <header className="chat-widget-header">
            <strong>{t(lang, 'chat.title')}</strong>
            <button
              type="button"
              className="chat-widget-close"
              onClick={() => setOpen(false)}
              aria-label={t(lang, 'chat.close')}
            >
              ×
            </button>
          </header>
          <div className="chat-widget-actions">
            <a className="chat-payment-history-btn" href={PAYMENT_HISTORY_HREF}>
              {t(lang, 'chat.viewPaymentHistory')}
            </a>
          </div>
          <div className="chat-widget-body">
            {lines.length === 0 ? (
              <p className="muted small">{t(lang, 'chat.welcome')}</p>
            ) : (
              <ul className="chat-widget-lines">
                {lines.map((line) => (
                  <li
                    key={line.id}
                    className={
                      line.role === 'user'
                        ? 'chat-line chat-line--user'
                        : 'chat-line chat-line--system'
                    }
                  >
                    {line.text}
                  </li>
                ))}
              </ul>
            )}
            {error ? (
              <p className="banner err" role="alert">
                {error}
              </p>
            ) : null}
          </div>
          <form className="chat-widget-form" onSubmit={(e) => void send(e)}>
            <input
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={t(lang, 'chat.placeholder')}
              maxLength={2000}
              disabled={busy}
              aria-label={t(lang, 'chat.placeholder')}
            />
            <button type="submit" className="primary" disabled={busy || !draft.trim()}>
              {busy ? t(lang, 'chat.sending') : t(lang, 'chat.send')}
            </button>
          </form>
        </div>
      ) : null}

      <button
        type="button"
        className="chat-widget-fab"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        title={t(lang, 'chat.fabTitle')}
      >
        {t(lang, 'chat.fabLabel')}
      </button>
    </div>
  );
}
