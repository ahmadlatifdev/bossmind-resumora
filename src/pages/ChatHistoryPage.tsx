import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAdminAuth } from '../components/AdminAuthGate';
import AdminMarkdown from '../components/AdminMarkdown';
import {
  createAdminChatConversation,
  deleteAdminChatConversation,
  getAdminChatConversation,
  listAdminChatConversations,
  type AdminChatConversation,
  type AdminGlobalChatMessage,
} from '../lib/adminApi';
import { t } from '../lib/i18n.js';

export default function ChatHistoryPage() {
  const { lang, password } = useAdminAuth();
  const [conversations, setConversations] = useState<AdminChatConversation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<AdminGlobalChatMessage[]>([]);
  const [error, setError] = useState('');
  const [loadingList, setLoadingList] = useState(false);
  const [loadingThread, setLoadingThread] = useState(false);
  const [busy, setBusy] = useState(false);

  const loadList = useCallback(async () => {
    setLoadingList(true);
    setError('');
    try {
      const data = await listAdminChatConversations(password);
      const rows = Array.isArray(data.conversations) ? data.conversations : [];
      setConversations(rows);
      setSelectedId((prev) => {
        if (prev && rows.some((r) => r.id === prev)) return prev;
        return rows[0]?.id || null;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : t(lang, 'master.chatHistoryLoadFailed'));
      setConversations([]);
    } finally {
      setLoadingList(false);
    }
  }, [password, lang]);

  const loadThread = useCallback(
    async (id: string | null) => {
      if (!id) {
        setMessages([]);
        return;
      }
      setLoadingThread(true);
      setError('');
      try {
        const data = await getAdminChatConversation(password, id);
        const msgs = Array.isArray(data.messages)
          ? data.messages
          : Array.isArray(data.conversation?.messages)
            ? data.conversation!.messages!
            : [];
        setMessages(msgs);
      } catch (err) {
        setError(err instanceof Error ? err.message : t(lang, 'master.chatHistoryLoadFailed'));
        setMessages([]);
      } finally {
        setLoadingThread(false);
      }
    },
    [password, lang]
  );

  useEffect(() => {
    void loadList();
  }, [loadList]);

  useEffect(() => {
    void loadThread(selectedId);
  }, [selectedId, loadThread]);

  async function onNewChat() {
    setBusy(true);
    setError('');
    try {
      const out = await createAdminChatConversation(password, 'New chat');
      const created = out.conversation;
      if (created?.id) {
        setConversations((prev) => [created, ...prev.filter((c) => c.id !== created.id)]);
        setSelectedId(created.id);
        setMessages([]);
      } else {
        await loadList();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t(lang, 'master.chatHistoryLoadFailed'));
    } finally {
      setBusy(false);
    }
  }

  async function onDelete(id: string) {
    if (!id || busy) return;
    setBusy(true);
    setError('');
    try {
      await deleteAdminChatConversation(password, id);
      setConversations((prev) => prev.filter((c) => c.id !== id));
      if (selectedId === id) {
        setSelectedId(null);
        setMessages([]);
      }
      await loadList();
    } catch (err) {
      setError(err instanceof Error ? err.message : t(lang, 'master.chatHistoryLoadFailed'));
    } finally {
      setBusy(false);
    }
  }

  const selected = conversations.find((c) => c.id === selectedId) || null;

  return (
    <div className="admin-dashboard">
      <p>
        <Link to="/admin/master">{t(lang, 'master.backOverview')}</Link>
        {' · '}
        <Link to="/admin/global-chat">{t(lang, 'master.nav.globalChat')}</Link>
        {' · '}
        <button
          type="button"
          className="admin-master__btn"
          onClick={() => void loadList()}
          disabled={loadingList || busy}
        >
          {loadingList ? t(lang, 'master.chatHistoryLoading') : t(lang, 'heal.refresh')}
        </button>
      </p>
      {error ? (
        <p className="admin-master__alert" role="alert">
          {error}
        </p>
      ) : null}

      <section className="admin-master__card admin-chat-history admin-chat-history--split">
        <h2>{t(lang, 'master.chatHistoryTitle')}</h2>
        <p className="admin-master__lead">{t(lang, 'master.chatHistoryLead')}</p>

        <div className="admin-chat-split">
          <aside className="admin-chat-split__sidebar" aria-label="Conversations">
            <button
              type="button"
              className="admin-master__btn admin-chat-split__new"
              onClick={() => void onNewChat()}
              disabled={busy}
            >
              + {t(lang, 'master.chatHistoryNew')}
            </button>
            <ul className="admin-chat-split__list">
              {conversations.map((c) => (
                <li key={c.id} className={c.id === selectedId ? 'is-active' : ''}>
                  <button
                    type="button"
                    className="admin-chat-split__title"
                    onClick={() => setSelectedId(c.id)}
                  >
                    {c.title || 'Untitled'}
                  </button>
                  <button
                    type="button"
                    className="admin-chat-split__delete"
                    title={t(lang, 'master.chatHistoryDelete')}
                    aria-label={t(lang, 'master.chatHistoryDelete')}
                    onClick={() => void onDelete(c.id)}
                    disabled={busy}
                  >
                    ×
                  </button>
                </li>
              ))}
              {!loadingList && conversations.length === 0 ? (
                <li className="admin-chat-split__empty">{t(lang, 'master.chatHistoryEmpty')}</li>
              ) : null}
            </ul>
          </aside>

          <div className="admin-chat-split__thread" role="log" aria-live="polite">
            <header className="admin-chat-split__thread-head">
              <h3>{selected?.title || t(lang, 'master.chatHistorySelect')}</h3>
              {loadingThread ? <span>{t(lang, 'master.chatHistoryLoading')}</span> : null}
            </header>
            {messages.length === 0 && !loadingThread ? (
              <p className="admin-master__lead">{t(lang, 'master.chatHistoryEmptyThread')}</p>
            ) : (
              <div className="admin-chat-history__list">
                {messages.map((msg) => {
                  const isAssistant = msg.role === 'assistant' || msg.role === 'hermes';
                  const body = msg.content || msg.text || '';
                  const when = msg.timestamp || msg.createdAt || '';
                  return (
                    <article
                      key={msg.id || `${when}-${msg.role}-${String(body).slice(0, 24)}`}
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
                        {when ? <time dateTime={when}>{when}</time> : null}
                      </header>
                      <div className="admin-chat-history__body">
                        {isAssistant ? <AdminMarkdown text={body} /> : <pre>{body}</pre>}
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
