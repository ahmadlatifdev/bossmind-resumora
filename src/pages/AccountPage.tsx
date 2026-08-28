import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { getRefundPreview, cancelSubscription, listRefundHistory } from '../lib/billingApi.js';
import { readSelectedPlan, getPlanById, localize } from '../lib/plans.js';
import './account.css';

function StatusBadge({ status }) {
  const s = String(status || 'pending').toLowerCase();
  return <span className={`refund-badge refund-badge--${s}`}>{s}</span>;
}

function CancelModal({ open, onClose, preview, loading, error, onConfirm }) {
  if (!open) return null;
  return (
    <div className="cancel-modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="cancel-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cancel-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="cancel-modal-title">Cancel plan &amp; refund preview</h2>
        {!preview ? (
          <p className="muted">Loading preview…</p>
        ) : (
          <>
            <p className="cancel-modal__status">
              Service delivery: <strong>{preview.service_delivery_status}</strong> (
              {preview.progress?.progress_percentage ?? 0}%)
            </p>
            <div className="cancel-modal__cols">
              <div>
                <h3>Delivered</h3>
                <ul>
                  {(preview.delivered || []).length === 0 ? (
                    <li className="muted">None yet</li>
                  ) : (
                    preview.delivered.map((d) => <li key={d.event_type}>{d.label}</li>)
                  )}
                </ul>
              </div>
              <div>
                <h3>Remaining</h3>
                <ul>
                  {(preview.remaining || []).length === 0 ? (
                    <li className="muted">All delivered</li>
                  ) : (
                    preview.remaining.map((d) => <li key={d.event_type}>{d.label}</li>)
                  )}
                </ul>
              </div>
            </div>
            <p className="cancel-modal__refund">
              Refund amount:{' '}
              <strong>
                {preview.refund_cents > 0 ? preview.refund_formatted : 'No refund available'}
              </strong>
            </p>
            <p className="muted small">{preview.reason}</p>
          </>
        )}
        {error ? <p className="error-text">{error}</p> : null}
        <div className="cancel-modal__actions">
          <button type="button" className="btn-keep" onClick={onClose} disabled={loading}>
            Keep Plan
          </button>
          <button
            type="button"
            className="btn-confirm-cancel"
            onClick={onConfirm}
            disabled={loading || !preview}
          >
            {loading ? 'Processing…' : 'Confirm Cancellation & Refund'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AccountPage() {
  const { user, loading: authLoading, subscriptionActive } = useAuth();
  const [modalOpen, setModalOpen] = useState(false);
  const [preview, setPreview] = useState(null);
  const [previewError, setPreviewError] = useState('');
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState(null);
  const [refunds, setRefunds] = useState([]);
  const plan = getPlanById(readSelectedPlan()) || getPlanById('basic');

  const loadRefunds = useCallback(async () => {
    try {
      const data = await listRefundHistory();
      setRefunds(data.refunds || []);
    } catch {
      setRefunds([]);
    }
  }, []);

  useEffect(() => {
    if (user) loadRefunds();
  }, [user, loadRefunds]);

  async function openCancelModal() {
    setModalOpen(true);
    setPreview(null);
    setPreviewError('');
    try {
      const data = await getRefundPreview({
        planId: plan?.id || 'basic',
        totalPaidCents: plan?.priceCents || 2900,
        email: user?.email,
      });
      setPreview(data);
    } catch (err) {
      // Local/demo fallback when API not deployed yet
      setPreview({
        service_delivery_status: 'NONE',
        progress: { progress_percentage: 0 },
        delivered: [],
        remaining: [
          { event_type: 'resume_uploaded', label: 'Resume uploaded' },
          { event_type: 'final_resume_delivered', label: 'Final resume delivered' },
        ],
        refund_cents: plan?.priceCents || 2900,
        refund_formatted: plan?.priceLabel || '$29',
        reason: 'full_refund_no_service_delivered (preview fallback)',
        total_paid_formatted: plan?.priceLabel || '$29',
      });
      setPreviewError(err.message || 'Preview API unavailable — showing local estimate');
    }
  }

  async function confirmCancel() {
    setBusy(true);
    setPreviewError('');
    try {
      await cancelSubscription({
        planId: plan?.id || 'basic',
        email: user?.email,
        totalPaidCents: plan?.priceCents || 2900,
      });
      setModalOpen(false);
      setToast({ type: 'success', text: 'Cancellation processed. Check Refund History below.' });
      await loadRefunds();
    } catch (err) {
      setPreviewError(err.message || 'Cancellation failed');
      setToast({ type: 'error', text: err.message || 'Cancellation failed' });
    } finally {
      setBusy(false);
    }
  }

  if (authLoading) {
    return (
      <div className="account-page">
        <p className="muted">Loading account…</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="account-page">
        <h1>My Account</h1>
        <p>
          Please <a href="/login">sign in</a> to manage your plan.
        </p>
      </div>
    );
  }

  return (
    <div className="account-page">
      <header className="account-hero">
        <h1>My Account</h1>
        <p className="lead">
          Signed in as <strong>{user.email}</strong>
        </p>
      </header>

      <section className="account-card">
        <h2>Current plan</h2>
        <p>
          {plan ? (
            <>
              <strong>{localize(plan.name, 'en')}</strong> — {plan.priceLabel}
            </>
          ) : (
            'No plan selected'
          )}
        </p>
        <p className="muted">Status: {subscriptionActive ? 'Active' : 'Inactive / trial'}</p>
        <button type="button" className="btn-cancel-plan" onClick={openCancelModal}>
          Cancel Plan
        </button>
      </section>

      <section className="account-card">
        <h2>Invoices</h2>
        <p className="muted">
          Paid invoices appear in your Stripe receipt emails and Billing Portal.
        </p>
      </section>

      <section className="account-card">
        <h2>Refund History</h2>
        {refunds.length === 0 ? (
          <p className="muted">No refunds yet.</p>
        ) : (
          <ul className="refund-list">
            {refunds.map((r) => (
              <li key={r.id || r.refund_id} className="refund-row">
                <div>
                  <strong>
                    {typeof r.amount === 'number' ? `$${(r.amount / 100).toFixed(2)}` : r.amount}
                  </strong>
                  <span className="muted"> — {r.reason || '—'}</span>
                </div>
                <div className="refund-row__meta">
                  <StatusBadge status={r.status} />
                  <time>{r.timestamp ? new Date(r.timestamp).toLocaleString() : '—'}</time>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <CancelModal
        open={modalOpen}
        onClose={() => !busy && setModalOpen(false)}
        preview={preview}
        loading={busy}
        error={previewError}
        onConfirm={confirmCancel}
      />

      {toast ? (
        <div className={`account-toast account-toast--${toast.type}`} role="status">
          {toast.text}
          <button type="button" onClick={() => setToast(null)} aria-label="Dismiss">
            ×
          </button>
        </div>
      ) : null}
    </div>
  );
}
