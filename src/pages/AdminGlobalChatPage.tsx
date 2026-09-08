import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAdminAuth } from '../components/AdminAuthGate';
import AdminHermesCommandChat from '../components/AdminHermesCommandChat';
import { createAdminChatConversation } from '../lib/adminApi';
import { t } from '../lib/i18n.js';

/**
 * Dedicated Global Admin Chat — not bound to a project dropdown.
 * New subjects create Firestore conversation IDs (auto-titled from first question).
 */
export default function AdminGlobalChatPage() {
  const { lang, password } = useAdminAuth();
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [title, setTitle] = useState('New chat');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function startNewSubject() {
    setBusy(true);
    setError('');
    try {
      const out = await createAdminChatConversation(password, 'New chat');
      const id = out.conversation?.id || null;
      setConversationId(id);
      setTitle(out.conversation?.title || 'New chat');
    } catch (err) {
      setError(err instanceof Error ? err.message : t(lang, 'master.chatHistoryLoadFailed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      className="admin-master__card admin-hermes-chat-panel admin-global-chat"
      id="global-chat"
    >
      <div className="admin-global-chat__head">
        <div>
          <h2>{t(lang, 'master.globalChatTitle')}</h2>
          <p className="admin-master__lead">{t(lang, 'master.globalChatPanelLead')}</p>
          <p className="admin-harness-chat__context">
            {t(lang, 'master.chatHistoryThread')}: {title}
            {conversationId ? ` · ${conversationId.slice(0, 8)}…` : ''}
          </p>
        </div>
        <div className="admin-global-chat__actions">
          <button
            type="button"
            className="admin-master__btn"
            onClick={() => void startNewSubject()}
            disabled={busy}
          >
            + {t(lang, 'master.chatHistoryNew')}
          </button>
          <Link className="admin-master__btn admin-master__btn--ghost" to="/admin/chat-history">
            {t(lang, 'master.nav.chatHistory')}
          </Link>
        </div>
      </div>
      {error ? (
        <p className="admin-master__alert" role="alert">
          {error}
        </p>
      ) : null}
      <AdminHermesCommandChat
        lang={lang}
        password={password}
        mode="global"
        conversationId={conversationId}
        onConversationIdChange={(id) => setConversationId(id || null)}
        onConversationTitled={(_id, nextTitle) => setTitle(nextTitle)}
      />
    </section>
  );
}
