import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { useLangOptional } from '../i18n/LangContext';
import { t, tFormat } from '../lib/i18n.js';
import { getRefundPreview, cancelSubscription, listRefundHistory } from '../lib/billingApi.js';
import { readSelectedPlan, getPlanById, localize } from '../lib/plans.js';
import './account.css';

function StatusBadge({ status, lang }) {
  const s = String(status || 'pending').toLowerCase();
  const label =
    t(lang, `refund.status.${s}`) !== `refund.status.${s}`
      ? t(lang, `refund.status.${s}`)
      : t(lang, `refund.${s}`) !== `refund.${s}`
        ? t(lang, `refund.${s}`)
        : s;
  return <span className={`refund-badge refund-badge--${s}`}>{label}</span>;
}

function CancelModal({ open, onClose, preview, loading, error, onConfirm, lang }) {
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
        <h2 id="cancel-modal-title">{t(lang, 'cancel.modalTitle')}</h2>
        {!preview ? (
          <p className="muted">{t(lang, 'cancel.loadingPreview')}</p>
        ) : (
          <>
            <p className="cancel-modal__status">
              {t(lang, 'cancel.serviceDelivery')}:{' '}
              <strong>{preview.service_delivery_status}</strong> (
              {preview.progress?.progress_percentage ?? 0}%)
            </p>
            <div className="cancel-modal__cols">
              <div>
                <h3>{t(lang, 'cancel.delivered')}</h3>
                <ul>
                  {(preview.delivered || []).length === 0 ? (
                    <li className="muted">{t(lang, 'cancel.noneDelivered')}</li>
                  ) : (
                    preview.delivered.map((d) => <li key={d.event_type}>{d.label}</li>)
                  )}
                </ul>
              </div>
              <div>
                <h3>{t(lang, 'cancel.remaining')}</h3>
                <ul>
                  {(preview.remaining || []).length === 0 ? (
                    <li className="muted">{t(lang, 'cancel.allDelivered')}</li>
                  ) : (
                    preview.remaining.map((d) => <li key={d.event_type}>{d.label}</li>)
                  )}
                </ul>
              </div>
            </div>
            <p className="cancel-modal__refund">
              {t(lang, 'cancel.refundAmount')}:{' '}
              <strong>
                {preview.refund_cents > 0 ? preview.refund_formatted : t(lang, 'cancel.noRefund')}
              </strong>
            </p>
            <p className="muted small">{preview.reason}</p>
          </>
        )}
        {error ? <p className="error-text">{error}</p> : null}
        <div className="cancel-modal__actions">
          <button type="button" className="btn-keep" onClick={onClose} disabled={loading}>
            {t(lang, 'cancel.keepPlan')}
          </button>
          <button
            type="button"
            className="btn-confirm-cancel"
            onClick={onConfirm}
            disabled={loading || !preview}
          >
            {loading ? t(lang, 'cancel.processing') : t(lang, 'cancel.confirm')}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AccountPage() {
  const { lang } = useLangOptional();
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
      setPreview({
        service_delivery_status: 'NONE',
        progress: { progress_percentage: 0 },
        delivered: [],
        remaining: [
          { event_type: 'resume_uploaded', label: t(lang, 'cancel.event.resumeUploaded') },
          {
            event_type: 'final_resume_delivered',
            label: t(lang, 'cancel.event.finalResumeDelivered'),
          },
        ],
        refund_cents: plan?.priceCents || 2900,
        refund_formatted: plan?.priceLabel || '$29',
        reason: 'full_refund_no_service_delivered (preview fallback)',
        total_paid_formatted: plan?.priceLabel || '$29',
      });
      setPreviewError(err.message || t(lang, 'cancel.previewFallback'));
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
      setToast({ type: 'success', text: t(lang, 'cancel.successToast') });
      await loadRefunds();
    } catch (err) {
      setPreviewError(err.message || t(lang, 'cancel.error'));
      setToast({ type: 'error', text: err.message || t(lang, 'cancel.error') });
    } finally {
      setBusy(false);
    }
  }

  if (authLoading) {
    return (
      <div className="account-page">
        <p className="muted">{t(lang, 'account.loading')}</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="account-page">
        <h1>{t(lang, 'account.title')}</h1>
        <p>
          {t(lang, 'account.signInHint')} <a href="/login">{t(lang, 'auth.signIn')}</a>
        </p>
      </div>
    );
  }

  return (
    <div className="account-page">
      <header className="account-hero">
        <h1>{t(lang, 'account.title')}</h1>
      </header>

      <section className="account-card">
        <h2>{t(lang, 'account.currentPlan')}</h2>
        <p>
          {plan ? (
            <>
              <strong>{localize(plan.name, lang)}</strong> — {plan.priceLabel}
            </>
          ) : (
            t(lang, 'account.noPlan')
          )}
        </p>
        <p className="muted">
          {t(lang, 'account.status')}:{' '}
          {subscriptionActive
            ? t(lang, 'account.planStatusActive')
            : t(lang, 'account.planStatusInactive')}
        </p>
        <button type="button" className="btn-cancel-plan" onClick={openCancelModal}>
          {t(lang, 'cancel.button')}
        </button>
      </section>

      <section className="account-card">
        <h2>{t(lang, 'account.tabInvoices')}</h2>
        <p className="muted">{t(lang, 'account.invoicesHint')}</p>
      </section>

      <section className="account-card">
        <h2>{t(lang, 'refund.historyTitle')}</h2>
        {refunds.length === 0 ? (
          <p className="muted">{t(lang, 'refund.noHistory')}</p>
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
                  <StatusBadge status={r.status} lang={lang} />
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
        lang={lang}
      />

      {toast ? (
        <div className={`account-toast account-toast--${toast.type}`} role="status">
          {toast.text}
          <button
            type="button"
            onClick={() => setToast(null)}
            aria-label={t(lang, 'common.dismiss')}
          >
            ×
          </button>
        </div>
      ) : null}
    </div>
  );
}
