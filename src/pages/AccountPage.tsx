import { useCallback, useEffect, useMemo, useState } from 'react';
import SiteHeader from '../components/SiteHeader';
import { useAuth } from '../auth/AuthContext';
import { auth } from '../lib/firebase';
import { getLang, setLang, t } from '../lib/i18n.js';
import '../app-shell.css';
import '../v6-luxury.css';

const DASHBOARD_URL = '/api/client/dashboard';
const REQUEST_URL = '/api/request-refund';
const CANCEL_URL = '/api/cancel-subscription';

type TabId = 'transactions' | 'invoices' | 'plan' | 'documents';

type PaymentRow = {
  id: string;
  status?: string | null;
  amount?: number;
  currency?: string;
  created?: string | null;
  payment_intent?: string | null;
  refundable?: boolean;
  plan?: string | null;
  planId?: string | null;
};

type InvoiceRow = {
  id: string;
  number?: string | null;
  status?: string | null;
  amount?: number;
  currency?: string;
  created?: string | null;
  hosted_invoice_url?: string | null;
  invoice_pdf?: string | null;
  plan?: string | null;
};

type DocRow = {
  id: string;
  kind?: string;
  title?: string;
  language?: string | null;
  createdAt?: string | null;
};

type DashboardPayload = {
  user?: { uid?: string; email?: string | null };
  plan?: {
    id?: string | null;
    name?: string | null;
    status?: string | null;
    subscriptionStatus?: string | null;
    purchaseDate?: unknown;
  };
  transactions?: PaymentRow[];
  invoices?: InvoiceRow[];
  documents?: DocRow[];
};

function money(cents?: number, currency = 'usd') {
  const n = Number(cents) || 0;
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: String(currency || 'usd').toUpperCase(),
  }).format(n / 100);
}

function paymentStatusLabel(lang: string, status?: string | null) {
  const s = String(status || '').toLowerCase();
  if (s === 'succeeded' || s === 'paid') return t(lang, 'payments.statusSucceeded');
  if (s === 'refunded') return t(lang, 'payments.statusRefunded');
  if (s === 'partially_refunded') return t(lang, 'payments.statusPartial');
  if (s === 'pending_approval') return t(lang, 'refund.pending');
  if (s === 'failed') return t(lang, 'payments.statusFailed');
  return status || '—';
}

function paymentPlanLabel(
  lang: string,
  row: { plan?: string | null; planId?: string | null; amount?: number }
) {
  if (row.plan) return row.plan;
  const id = String(row.planId || '').toLowerCase();
  if (id === 'basic') return t(lang, 'plans.basic.name');
  if (id === 'balanced' || id === 'pro') return t(lang, 'plans.pro.name');
  if (id === 'professional' || id === 'business') return t(lang, 'plans.business.name');
  if (id === 'advanced' || id === 'enterprise') return t(lang, 'plans.enterprise.name');
  const cents = Number(row.amount) || 0;
  if (cents === 2900) return t(lang, 'plans.basic.name');
  if (cents === 4900) return t(lang, 'plans.pro.name');
  if (cents === 7900) return t(lang, 'plans.business.name');
  if (cents === 11000) return t(lang, 'plans.enterprise.name');
  return t(lang, 'payments.planUnknown');
}

export default function AccountPage() {
  const { user, profile, loading, subscriptionActive, signOut, refreshProfile } = useAuth();
  const [lang, setLangState] = useState(() => getLang());
  const [tab, setTab] = useState<TabId>(() => {
    try {
      const hash = String(window.location.hash || '')
        .replace(/^#/, '')
        .toLowerCase();
      if (hash === 'invoices') return 'invoices';
      if (hash === 'plan') return 'plan';
      if (hash === 'documents') return 'documents';
      if (hash === 'transactions' || hash === 'payments' || hash === 'payment-history') {
        return 'transactions';
      }
    } catch {
      /* ignore */
    }
    return 'transactions';
  });
  const [dash, setDash] = useState<DashboardPayload | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [selectedPi, setSelectedPi] = useState('');
  const [cancelReason, setCancelReason] = useState('');
  const [cancelBusy, setCancelBusy] = useState(false);

  const onLang = (code: string) => setLangState(setLang(code));

  const authHeaders = useCallback(async () => {
    const token = await auth.currentUser?.getIdToken();
    if (!token) throw new Error('Not signed in');
    return {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    };
  }, []);

  const load = useCallback(async () => {
    if (!user) return;
    setError('');
    try {
      const headers = await authHeaders();
      const res = await fetch(DASHBOARD_URL, { headers });
      const data = (await res.json().catch(() => ({}))) as DashboardPayload & { error?: string };
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setDash(data);
      const txs = Array.isArray(data.transactions) ? data.transactions : [];
      const firstRefundable = txs.find((i) => i.refundable && i.payment_intent);
      setSelectedPi((prev) => {
        if (prev && txs.some((i) => i.payment_intent === prev && i.refundable)) return prev;
        return firstRefundable?.payment_intent || '';
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : t(lang, 'account.dashboardError'));
    }
  }, [user, authHeaders, lang]);

  useEffect(() => {
    if (user) void load();
  }, [user, load]);

  useEffect(() => {
    const applyHash = () => {
      const hash = String(window.location.hash || '')
        .replace(/^#/, '')
        .toLowerCase();
      if (hash === 'invoices') setTab('invoices');
      else if (hash === 'plan') setTab('plan');
      else if (hash === 'documents') setTab('documents');
      else if (hash === 'transactions' || hash === 'payments' || hash === 'payment-history') {
        setTab('transactions');
      }
    };
    applyHash();
    window.addEventListener('hashchange', applyHash);
    return () => window.removeEventListener('hashchange', applyHash);
  }, []);

  useEffect(() => {
    if (!user) return;
    void refreshProfile();
    let sessionId = '';
    try {
      sessionId = new URLSearchParams(window.location.search).get('session_id') || '';
    } catch {
      sessionId = '';
    }
    if (!sessionId) return;
    const tick = window.setInterval(() => {
      void refreshProfile();
      void load();
    }, 2000);
    const stop = window.setTimeout(() => window.clearInterval(tick), 30000);
    return () => {
      window.clearInterval(tick);
      window.clearTimeout(stop);
    };
  }, [user, refreshProfile, load]);

  const transactions = dash?.transactions || [];
  const invoices = dash?.invoices || [];
  const documents = dash?.documents || [];
  const plan = dash?.plan;

  const hasPending = transactions.some((i) => i.status === 'pending_approval');
  const hasRefundable = useMemo(
    () => transactions.some((i) => i.refundable && i.payment_intent),
    [transactions]
  );
  const canRequest =
    Boolean(user) && subscriptionActive && !hasPending && hasRefundable && Boolean(selectedPi);

  async function requestRefund() {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const headers = await authHeaders();
      const res = await fetch(REQUEST_URL, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          reason: 'requested_by_customer',
          ...(selectedPi ? { payment_intent: selectedPi } : {}),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setNotice(data.alreadyExists ? t(lang, 'refund.pending') : t(lang, 'refund.requestSent'));
      await load();
      await refreshProfile();
    } catch (err) {
      setError(err instanceof Error ? err.message : t(lang, 'refund.error'));
    } finally {
      setBusy(false);
    }
  }

  async function cancelPlan() {
    const reason = cancelReason.trim();
    if (!reason) {
      setError(t(lang, 'cancel.reasonRequired'));
      return;
    }
    setCancelBusy(true);
    setError('');
    setNotice('');
    try {
      const headers = await authHeaders();
      const res = await fetch(CANCEL_URL, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          cancelReason: reason,
          ...(selectedPi ? { payment_intent: selectedPi } : {}),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setNotice(data.alreadyExists ? t(lang, 'refund.pending') : t(lang, 'cancel.requestSent'));
      setCancelReason('');
      await load();
      await refreshProfile();
    } catch (err) {
      setError(err instanceof Error ? err.message : t(lang, 'cancel.error'));
    } finally {
      setCancelBusy(false);
    }
  }

  const tabs: { id: TabId; label: string }[] = [
    { id: 'transactions', label: t(lang, 'account.tabTransactions') },
    { id: 'invoices', label: t(lang, 'account.tabInvoices') },
    { id: 'plan', label: t(lang, 'account.tabPlan') },
    { id: 'documents', label: t(lang, 'account.tabDocuments') },
  ];

  return (
    <div className="app-shell">
      <SiteHeader lang={lang} onLangChange={onLang} currentPath="/account" />
      <main className="app-main narrow account-dashboard">
        <h1>{t(lang, 'account.title')}</h1>
        <p className="lead">{t(lang, 'account.dashboardLead')}</p>

        {loading ? <p className="muted">{t(lang, 'auth.checkingAccess')}</p> : null}

        {!loading && !user ? (
          <p className="plan-chip warn">
            {t(lang, 'account.signInHint')}{' '}
            <a href="/login?from=/account">{t(lang, 'auth.signIn')}</a>
          </p>
        ) : null}

        {user ? (
          <div className="account-dashboard-layout">
            <nav className="account-dashboard-nav" aria-label={t(lang, 'account.title')}>
              {tabs.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={tab === item.id ? 'account-tab active' : 'account-tab'}
                  onClick={() => setTab(item.id)}
                >
                  {item.label}
                </button>
              ))}
            </nav>

            <div className="account-dashboard-main">
              {notice ? (
                <p className="banner ok" role="status">
                  {notice}
                </p>
              ) : null}
              {error ? (
                <p className="banner err" role="alert">
                  {error}
                </p>
              ) : null}

              {tab === 'transactions' ? (
                <section className="panel" id="transactions">
                  <h2>{t(lang, 'account.tabTransactions')}</h2>
                  {transactions.length === 0 ? (
                    <p className="muted">{t(lang, 'payments.noHistory')}</p>
                  ) : (
                    <ul className="payment-history-list">
                      {transactions.map((row) => {
                        const pi = row.payment_intent || '';
                        const selectable = Boolean(row.refundable && pi);
                        const body = (
                          <span>
                            <strong>{paymentPlanLabel(lang, row)}</strong>
                            {' · '}
                            <strong>{money(row.amount, row.currency)}</strong>{' '}
                            {String(row.currency || 'usd').toUpperCase()}
                            {' · '}
                            <span className="plan-chip">
                              {paymentStatusLabel(lang, row.status)}
                            </span>
                            {row.created
                              ? ` · ${t(lang, 'payments.date')}: ${new Date(row.created).toLocaleDateString()}`
                              : ''}
                          </span>
                        );
                        return (
                          <li key={row.id} className="payment-history-item">
                            {selectable ? (
                              <label className="payment-history-row">
                                <input
                                  type="radio"
                                  name="refundPayment"
                                  checked={selectedPi === pi}
                                  onChange={() => setSelectedPi(pi)}
                                />
                                {body}
                              </label>
                            ) : (
                              <span className="payment-history-row">{body}</span>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                  <div className="row-actions" style={{ marginTop: 16 }}>
                    <button
                      type="button"
                      className="primary"
                      disabled={busy || !canRequest}
                      onClick={() => void requestRefund()}
                    >
                      {busy ? t(lang, 'refund.working') : t(lang, 'refund.requestButton')}
                    </button>
                  </div>
                </section>
              ) : null}

              {tab === 'invoices' ? (
                <section className="panel">
                  <h2>{t(lang, 'account.tabInvoices')}</h2>
                  {invoices.length === 0 ? (
                    <p className="muted">{t(lang, 'account.noInvoices')}</p>
                  ) : (
                    <ul className="payment-history-list">
                      {invoices.map((inv) => (
                        <li key={inv.id} className="payment-history-item">
                          <strong>{inv.plan || inv.number || t(lang, 'account.receipt')}</strong>
                          {' · '}
                          {money(inv.amount, inv.currency)}{' '}
                          {String(inv.currency || 'usd').toUpperCase()}
                          {' · '}
                          <span className="plan-chip">{paymentStatusLabel(lang, inv.status)}</span>
                          {inv.created ? ` · ${new Date(inv.created).toLocaleDateString()}` : ''}
                          {/* Hosted Stripe PDF links are customer-scoped; never link to dashboard.stripe.com */}
                          {inv.invoice_pdf ? (
                            <>
                              {' · '}
                              <a href={inv.invoice_pdf} target="_blank" rel="noreferrer">
                                {t(lang, 'account.downloadPdf')}
                              </a>
                            </>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              ) : null}

              {tab === 'plan' ? (
                <section className="panel">
                  <h2>{t(lang, 'account.tabPlan')}</h2>
                  <p>
                    <strong>{t(lang, 'auth.email')}:</strong>{' '}
                    {user.email || profile?.email || dash?.user?.email || '—'}
                  </p>
                  <p>
                    <strong>{t(lang, 'account.plan')}:</strong>{' '}
                    {plan?.name ||
                      paymentPlanLabel(lang, {
                        plan: plan?.name,
                        planId: plan?.id,
                      }) ||
                      String(profile?.plan || '—')}{' '}
                    (
                    {subscriptionActive
                      ? t(lang, 'account.planActive')
                      : t(lang, 'account.planInactive')}
                    )
                  </p>
                  {subscriptionActive ? (
                    <div className="cancel-plan-block" style={{ marginTop: 16 }}>
                      <label>
                        {t(lang, 'cancel.reasonLabel')}
                        <textarea
                          value={cancelReason}
                          onChange={(e) => setCancelReason(e.target.value)}
                          placeholder={t(lang, 'cancel.reasonPlaceholder')}
                          rows={3}
                          maxLength={500}
                          style={{ width: '100%', marginTop: 8 }}
                        />
                      </label>
                      <button
                        type="button"
                        className="secondary"
                        style={{ marginTop: 10 }}
                        disabled={cancelBusy || hasPending || !cancelReason.trim()}
                        onClick={() => void cancelPlan()}
                      >
                        {cancelBusy ? t(lang, 'cancel.working') : t(lang, 'cancel.button')}
                      </button>
                    </div>
                  ) : (
                    <p className="muted small">
                      {t(lang, 'refund.needPaidPlan')}{' '}
                      <a href="/pricing">{t(lang, 'nav.pricing')}</a>
                    </p>
                  )}
                  <div className="row-actions" style={{ marginTop: 16 }}>
                    <button type="button" className="secondary" onClick={() => void signOut()}>
                      {t(lang, 'nav.signOut')}
                    </button>
                  </div>
                </section>
              ) : null}

              {tab === 'documents' ? (
                <section className="panel">
                  <h2>{t(lang, 'account.tabDocuments')}</h2>
                  {documents.length === 0 ? (
                    <p className="muted">{t(lang, 'account.noDocuments')}</p>
                  ) : (
                    <ul className="payment-history-list">
                      {documents.map((doc) => (
                        <li key={doc.id} className="payment-history-item">
                          <span className="plan-chip">
                            {doc.kind === 'download'
                              ? t(lang, 'account.docDownload')
                              : t(lang, 'account.docUpload')}
                          </span>{' '}
                          <strong>{doc.title || '—'}</strong>
                          {doc.language ? ` · ${doc.language}` : ''}
                          {doc.createdAt
                            ? ` · ${new Date(String(doc.createdAt)).toLocaleDateString()}`
                            : ''}
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              ) : null}
            </div>
          </div>
        ) : null}
      </main>
    </div>
  );
}
