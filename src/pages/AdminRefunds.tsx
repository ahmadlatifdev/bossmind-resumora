import { useCallback, useEffect, useState, type FormEvent } from 'react';
import BrandLogo from '../components/BrandLogo';
import '../app-shell.css';

const LIST_URL = '/api/admin/refund-requests';
const DECIDE_URL = '/api/admin/refund-requests/decide';
const SESSION_KEY = 'resumora_admin_refund_pw';

type RefundItem = {
  id: string;
  status?: string;
  payment_intent_id?: string;
  amount?: number;
  currency?: string;
  customer_email?: string;
  planId?: string | null;
  createdAt?: string | null;
  stripe_refund_id?: string | null;
  request_type?: string | null;
  service_provided?: boolean;
};

function money(cents?: number, currency = 'usd') {
  const n = Number(cents) || 0;
  return new Intl.NumberFormat('en-CA', {
    style: 'currency',
    currency: String(currency || 'usd').toUpperCase(),
  }).format(n / 100);
}

export default function AdminRefundsPage() {
  const [password, setPassword] = useState(() => sessionStorage.getItem(SESSION_KEY) || '');
  const [unlocked, setUnlocked] = useState(() => Boolean(sessionStorage.getItem(SESSION_KEY)));
  const [items, setItems] = useState<RefundItem[]>([]);
  const [filter, setFilter] = useState('pending_approval');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async (pw: string, status: string) => {
    setLoading(true);
    setError('');
    try {
      const qs = new URLSearchParams({ status });
      const res = await fetch(`${LIST_URL}?${qs}`, {
        headers: { 'X-Admin-Password': pw },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      setItems(Array.isArray(data.items) ? data.items : []);
      setUnlocked(true);
      sessionStorage.setItem(SESSION_KEY, pw);
    } catch (err) {
      setUnlocked(false);
      sessionStorage.removeItem(SESSION_KEY);
      setItems([]);
      setError(err instanceof Error ? err.message : 'Failed to load refunds');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (unlocked && password) {
      void load(password, filter);
    }
  }, [unlocked, password, filter, load]);

  async function onUnlock(e: FormEvent) {
    e.preventDefault();
    await load(password.trim(), filter);
  }

  async function decide(requestId: string, decision: 'approve' | 'reject') {
    setBusyId(requestId);
    setNotice('');
    setError('');
    try {
      const res = await fetch(DECIDE_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Password': password,
        },
        body: JSON.stringify({ requestId, decision }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setNotice(
        decision === 'approve'
          ? `Refund approved${data.stripe_refund_id ? ` (${data.stripe_refund_id})` : ''}.`
          : 'Request rejected — no refund issued.'
      );
      await load(password, filter);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setBusyId('');
    }
  }

  function logout() {
    sessionStorage.removeItem(SESSION_KEY);
    setPassword('');
    setUnlocked(false);
    setItems([]);
  }

  return (
    <div className="app-shell admin-refunds">
      <header className="app-header site-header site-header--logo-lang-only" role="banner">
        <a href="/" className="site-logo" aria-label="RESUMORA.NET — Home">
          <BrandLogo decorative />
        </a>
        <div className="header-trailing">
          {unlocked ? (
            <button type="button" className="lang-btn" onClick={logout}>
              Lock
            </button>
          ) : null}
        </div>
      </header>

      <main className="app-main">
        <h1>Manual Approval Refunds</h1>
        <p className="lead">
          Pending refunds are created when checkout completes and the customer&apos;s service is not
          marked provided. Approve to refund immediately, or reject to keep the charge. Pending
          requests auto-refund after 10 business days.
        </p>

        {!unlocked ? (
          <form className="panel" onSubmit={onUnlock}>
            <label>
              Admin password
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </label>
            <button type="submit" className="primary" disabled={loading}>
              {loading ? 'Checking…' : 'Unlock'}
            </button>
          </form>
        ) : (
          <>
            <div className="mode-tabs" role="tablist">
              {[
                ['pending_approval', 'Pending'],
                ['refunded', 'Refunded'],
                ['rejected', 'Rejected'],
                ['all', 'All'],
              ].map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  data-active={filter === value}
                  onClick={() => setFilter(value)}
                >
                  {label}
                </button>
              ))}
            </div>

            {loading ? <p className="muted">Loading…</p> : null}
            {notice ? (
              <p className="banner ok" role="status">
                {notice}
              </p>
            ) : null}

            <section className="panel">
              {items.length === 0 && !loading ? (
                <p className="muted">No records for this filter.</p>
              ) : (
                <div className="admin-refund-table-wrap">
                  <table className="admin-refund-table">
                    <thead>
                      <tr>
                        <th>Created</th>
                        <th>Customer</th>
                        <th>Amount</th>
                        <th>Plan</th>
                        <th>Type</th>
                        <th>Service</th>
                        <th>Status</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((row) => (
                        <tr key={row.id}>
                          <td>{row.createdAt ? new Date(row.createdAt).toLocaleString() : '—'}</td>
                          <td>{row.customer_email || '—'}</td>
                          <td>{money(row.amount, row.currency)}</td>
                          <td>{row.planId || '—'}</td>
                          <td>{row.request_type || '—'}</td>
                          <td>{row.service_provided ? 'yes' : 'no'}</td>
                          <td>{row.status || '—'}</td>
                          <td>
                            {row.status === 'pending_approval' ? (
                              <div className="admin-refund-actions">
                                <button
                                  type="button"
                                  className="primary"
                                  disabled={busyId === row.id}
                                  onClick={() => decide(row.id, 'approve')}
                                >
                                  {busyId === row.id ? 'Working…' : 'Approve Refund'}
                                </button>
                                <button
                                  type="button"
                                  disabled={busyId === row.id}
                                  onClick={() => decide(row.id, 'reject')}
                                >
                                  Reject
                                </button>
                              </div>
                            ) : (
                              <span className="muted small">{row.stripe_refund_id || '—'}</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        )}

        {error ? (
          <p className="banner err" role="alert">
            {error}
          </p>
        ) : null}
      </main>
    </div>
  );
}
