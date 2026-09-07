import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAdminAuth } from '../components/AdminAuthGate';
import AdminMarkdown from '../components/AdminMarkdown';
import { fetchAdminGlobalChat, type AdminGlobalChatMessage } from '../lib/adminApi';
import { t } from '../lib/i18n.js';

export default function ChatHistoryPage() {
  const { lang, password } = useAdminAuth();
  const [messages, setMessages] = useState<AdminGlobalChatMessage[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await fetchAdminGlobalChat(password);
      setMessages(Array.isArray(data.messages) ? data.messages : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : t(lang, 'master.chatHistoryLoadFailed'));
      setMessages([]);
    } finally {
      setLoading(false);
    }
  }, [password, lang]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="admin-dashboard">
      <p>
        <Link to="/admin/master">{t(lang, 'master.backOverview')}</Link>
        {' · '}
        <button
          type="button"
          className="admin-master__btn"
          onClick={() => void load()}
          disabled={loading}
        >
          {loading ? t(lang, 'master.chatHistoryLoading') : t(lang, 'heal.refresh')}
        </button>
      </p>
      {error ? (
        <p className="admin-master__alert" role="alert">
          {error}
        </p>
      ) : null}
      <section className="admin-master__card admin-chat-history">
        <h2>{t(lang, 'master.chatHistoryTitle')}</h2>
        <p className="admin-master__lead">{t(lang, 'master.chatHistoryLead')}</p>
        {messages.length === 0 && !loading && !error ? (
          <p className="admin-master__lead">{t(lang, 'master.chatHistoryEmpty')}</p>
        ) : (
          <div className="admin-chat-history__list" role="log" aria-live="polite">
            {messages.map((msg) => {
              const isAssistant = msg.role === 'assistant' || msg.role === 'hermes';
              return (
                <article
                  key={msg.id || `${msg.createdAt}-${msg.role}-${String(msg.text).slice(0, 24)}`}
                  className={
                    isAssistant
                      ? 'admin-chat-history__item admin-chat-history__item--assistant'
                      : 'admin-chat-history__item admin-chat-history__item--user'
                  }
                >
                  <header className="admin-chat-history__meta">
                    <span className="admin-chat-history__role">
                      {isAssistant ? 'Hermes' : 'User'}
                    </span>
                    {msg.engine ? (
                      <span className="admin-chat-history__engine">{msg.engine}</span>
                    ) : null}
                    {msg.createdAt ? <time dateTime={msg.createdAt}>{msg.createdAt}</time> : null}
                  </header>
                  <div className="admin-chat-history__body">
                    {isAssistant ? <AdminMarkdown text={msg.text || ''} /> : <pre>{msg.text}</pre>}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
