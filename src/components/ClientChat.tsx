import { useState, type FormEvent } from 'react';
import { useAuth } from '../auth/AuthContext';
import { useLangOptional } from '../i18n/LangContext';
import { t, tFormat } from '../lib/i18n.js';
import { resolveLocalFaqReply, SUPPORT_EMAIL } from '../lib/chatFaq.js';
import './ClientChat.css';

type ChatLine = { role: 'user' | 'support'; text: string };

const CHAT_ENDPOINTS = ['/api/chat/message', '/api/chat/send'] as const;

const QUICK = [
  { intent: 'payment', key: 'chat.quick.payments' },
  { intent: 'resume', key: 'chat.quick.studio' },
  { intent: 'technical', key: 'chat.quick.videos' },
  { intent: 'human', key: 'chat.quick.human' },
] as const;

function isJsonContentType(value: string | null) {
  return String(value || '')
    .toLowerCase()
    .includes('application/json');
}

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
  const [showEmailCallback, setShowEmailCallback] = useState(false);

  if (loading || !user || !subscriptionActive) {
    return null;
  }

  const userEmail = user.email || 'member';

  function supportMailto() {
    const subject = encodeURIComponent(`Support Request - ${userEmail}`);
    const body = encodeURIComponent(tFormat(lang, 'chat.emailBodyTemplate', { email: userEmail }));
    return `mailto:${SUPPORT_EMAIL}?subject=${subject}&body=${body}`;
  }

  function closePanel() {
    setOpen(false);
    setDraft('');
    setSending(false);
    setShowEmailCallback(false);
  }

  function localReply(text: string, intentHint?: string) {
    return resolveLocalFaqReply({ message: text, lang, intentHint, t });
  }

  async function postMessage(text: string, intentHint?: string) {
    let token = '';
    try {
      token = await user.getIdToken();
    } catch {
      return localReply(text, intentHint);
    }

    const payload = JSON.stringify({ message: text, lang, intent: intentHint || '' });
    let lastStatus = 0;

    for (const path of CHAT_ENDPOINTS) {
      try {
        const res = await fetch(path, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: payload,
        });
        lastStatus = res.status;
        const contentType = res.headers.get('content-type');
        const raw = await res.text();

        // Hosting mis-route: SPA HTML with 200 instead of the Cloud Function.
        if (!isJsonContentType(contentType) || raw.trimStart().startsWith('<!DOCTYPE')) {
          continue;
        }

        let data: Record<string, unknown> = {};
        try {
          data = JSON.parse(raw);
        } catch {
          continue;
        }

        if (res.status === 401 || res.status === 403) {
          return {
            ...localReply(text, intentHint),
            escalate: true,
            reply: t(lang, 'chat.sendUnauthorized'),
          };
        }

        if (!res.ok) {
          continue;
        }

        return {
          reply: String(data.reply || t(lang, 'chat.faq.fallback')),
          escalate: Boolean(data.escalate) || data.intent === 'human' || data.intent === 'fallback',
          intent: String(data.intent || 'fallback'),
          source: 'api',
        };
      } catch {
        /* try next endpoint */
      }
    }

    // Permanent resilience: FAQ still answers when Cloud Function rewrite is missing.
    void lastStatus;
    return localReply(text, intentHint);
  }

  async function submitText(text: string, intentHint?: string) {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    setSending(true);
    setShowEmailCallback(false);
    setLines((prev) => [...prev, { role: 'user', text: trimmed }]);
    setDraft('');
    try {
      const result = await postMessage(trimmed, intentHint);
      setLines((prev) => [...prev, { role: 'support', text: result.reply }]);
      if (result.escalate || intentHint === 'human') {
        setShowEmailCallback(true);
      }
    } catch {
      const fallback = localReply(trimmed, intentHint);
      setLines((prev) => [...prev, { role: 'support', text: fallback.reply }]);
      setShowEmailCallback(true);
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
          <div className="client-chat__links">
            <a className="client-chat__history" href="/account">
              {t(lang, 'chat.viewPaymentHistory')}
            </a>
            <a className="client-chat__contact" href={supportMailto()}>
              {t(lang, 'chat.contactSupport')}
            </a>
          </div>
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
          {showEmailCallback ? (
            <div
              className="client-chat__escalate"
              role="region"
              aria-label={t(lang, 'chat.emailSupport')}
            >
              <a className="client-chat__email-btn" href={supportMailto()}>
                {t(lang, 'chat.emailSupport')}
              </a>
              <p className="client-chat__sla">{t(lang, 'chat.responseSla')}</p>
            </div>
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
