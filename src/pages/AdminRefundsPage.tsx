import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAdminAuth } from '../components/AdminAuthGate';
import { fetchMasterDashboard } from '../lib/adminApi';
import { t } from '../lib/i18n.js';

type RefundRow = {
  id?: string;
  status?: string;
  amountCents?: number | null;
  createdAt?: string | null;
  source?: string;
};

export default function AdminRefundsPage() {
  const { lang, password } = useAdminAuth();
  const [pending, setPending] = useState<RefundRow[]>([]);
  const [recent, setRecent] = useState<RefundRow[]>([]);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const dashboard = await fetchMasterDashboard(password);
      setPending(Array.isArray(dashboard?.refunds?.pending) ? dashboard.refunds.pending : []);
      setRecent(Array.isArray(dashboard?.refunds?.recent) ? dashboard.refunds.recent : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : t(lang, 'master.loadFailed'));
    }
  }, [password, lang]);

  useEffect(() => {
    void load();
  }, [load]);

  function rows(list: RefundRow[]) {
    if (!list.length) return <p className="admin-master__lead">{t(lang, 'master.refundsEmpty')}</p>;
    return (
      <ul className="admin-feed">
        {list.map((r) => (
          <li key={String(r.id)}>
            <span className="admin-feed__kind">{r.status || 'refund'}</span>
            <span>
              {r.amountCents != null ? `${(Number(r.amountCents) / 100).toFixed(2)} USD` : '—'}
            </span>
            <time>{r.createdAt ? String(r.createdAt).slice(0, 16).replace('T', ' ') : ''}</time>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div className="admin-dashboard">
      <p>
        <Link to="/admin/master">{t(lang, 'master.backOverview')}</Link>
      </p>
      {error ? (
        <p className="admin-master__alert" role="alert">
          {error}
        </p>
      ) : null}
      <section className="admin-master__card">
        <h2>{t(lang, 'master.refundsPending')}</h2>
        {rows(pending)}
      </section>
      <section className="admin-master__card">
        <h2>{t(lang, 'master.refundsRecent')}</h2>
        {rows(recent)}
      </section>
    </div>
  );
}
