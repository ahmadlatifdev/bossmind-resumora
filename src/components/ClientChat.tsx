import { useState, type FormEvent } from 'react';
import { useAuth } from '../auth/AuthContext';
import { useLangOptional } from '../i18n/LangContext';
import { t } from '../lib/i18n.js';
import './ClientChat.css';

/**
 * Paid-member Client Chat FAB. Hidden when not signed in or subscription inactive.
 */
export default function ClientChat() {
  const { lang } = useLangOptional();
  const { user, loading, subscriptionActive } = useAuth();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState('');

  if (loading || !user || !subscriptionActive) {
    return null;
  }

  async function onSend(e: FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;
    setSending(true);
    setNotice('');
    try {
      await new Promise((r) => setTimeout(r, 250));
      setDraft('');
      setNotice(t(lang, 'chat.received'));
    } catch {
      setNotice(t(lang, 'chat.sendFailed'));
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="client-chat" data-ssot="client-chat">
      {open ? (
        <section className="client-chat__panel" role="dialog" aria-labelledby="client-chat-title">
          <header className="client-chat__header">
            <h2 id="client-chat-title">{t(lang, 'chat.title')}</h2>
            <button
              type="button"
              className="client-chat__close"
              onClick={() => setOpen(false)}
              aria-label={t(lang, 'chat.close')}
            >
              ×
            </button>
          </header>
          <p className="client-chat__welcome">{t(lang, 'chat.welcome')}</p>
          <a className="client-chat__history" href="/account">
            {t(lang, 'chat.viewPaymentHistory')}
          </a>
          {notice ? (
            <p className="client-chat__notice" role="status">
              {notice}
            </p>
          ) : null}
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
