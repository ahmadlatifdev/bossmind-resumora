import { useAdminAuth } from '../components/AdminAuthGate';
import AdminHermesCommandChat from '../components/AdminHermesCommandChat';
import { t } from '../lib/i18n.js';

/**
 * Dedicated Global Admin Chat — not bound to a project dropdown.
 * Auth: unlocked admin password (ADMIN_REFUND_PASSWORD / X-Admin-Password).
 */
export default function AdminGlobalChatPage() {
  const { lang, password } = useAdminAuth();

  return (
    <section
      className="admin-master__card admin-hermes-chat-panel admin-global-chat"
      id="global-chat"
    >
      <h2>{t(lang, 'master.globalChatTitle')}</h2>
      <p className="admin-master__lead">{t(lang, 'master.globalChatPanelLead')}</p>
      <AdminHermesCommandChat lang={lang} password={password} mode="global" />
    </section>
  );
}
