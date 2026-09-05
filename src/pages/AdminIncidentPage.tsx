import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useAdminAuth } from '../components/AdminAuthGate';
import { mapAdminStatus, toAdminEnglish } from '../lib/adminEnglishLabels';
import { fetchAdminIncident, resolveAdminIncident, type AdminFeedDetail } from '../lib/adminApi';
import { cacheFeedItem, readCachedFeedItem } from '../lib/adminFeedCache';

function formatWhen(at?: string | null) {
  if (!at) return '—';
  return String(at).slice(0, 16).replace('T', ' ');
}

export default function AdminIncidentPage() {
  const { id = '' } = useParams();
  const [params] = useSearchParams();
  const kind = String(params.get('kind') || 'incident').toLowerCase();
  const { password } = useAdminAuth();
  const navigate = useNavigate();
  const [item, setItem] = useState<AdminFeedDetail | null>(() => readCachedFeedItem(id));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setBusy(true);
    setError('');
    try {
      const out = await fetchAdminIncident(password, id, kind);
      if (out.item) {
        setItem(out.item);
        cacheFeedItem(out.item);
      }
    } catch (err) {
      if (!readCachedFeedItem(id)) {
        setError(err instanceof Error ? err.message : 'Could not load incident');
      }
    } finally {
      setBusy(false);
    }
  }, [password, id, kind]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 4200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  function onAcknowledge() {
    setToast({ type: 'success', text: 'Incident acknowledged. Use Mark as Resolved to close it.' });
  }

  async function onResolve() {
    if (kind !== 'incident') {
      setToast({ type: 'error', text: 'Resolve is only available for system incidents.' });
      return;
    }
    if (!window.confirm('Mark this incident as resolved?')) return;

    const previous = item;
    setBusy(true);
    setError('');
    setItem((cur) => (cur ? { ...cur, status: 'resolved', resolved: true } : cur));
    setToast({ type: 'success', text: 'Incident marked as resolved' });

    try {
      await resolveAdminIncident(password, id, 'Resolved from incident detail page');
      await load();
    } catch (err) {
      setItem(previous);
      setToast({
        type: 'error',
        text: err instanceof Error ? err.message : 'Could not resolve incident',
      });
    } finally {
      setBusy(false);
    }
  }

  if (!id) {
    return (
      <div className="admin-dashboard">
        <p className="admin-master__alert">Missing incident id.</p>
        <Link to="/admin/master">Back to list</Link>
      </div>
    );
  }

  return (
    <div className="admin-dashboard admin-incident-page">
      {toast ? (
        <div className={`admin-toast admin-toast--${toast.type}`} role="status" aria-live="polite">
          <span>{toast.text}</span>
          <button type="button" aria-label="Dismiss" onClick={() => setToast(null)}>
            ×
          </button>
        </div>
      ) : null}

      <div className="admin-actions">
        <button
          type="button"
          className="admin-master__btn admin-master__btn--ghost"
          onClick={() => navigate('/admin/master#incidents')}
        >
          Back to list
        </button>
        <button
          type="button"
          className="admin-master__btn admin-master__btn--ghost"
          disabled={busy}
          onClick={() => void load()}
        >
          {busy ? 'Loading…' : 'Refresh'}
        </button>
      </div>

      {error ? (
        <p className="admin-master__alert" role="alert">
          {error}
        </p>
      ) : null}

      <section className="admin-master__card admin-incident-header">
        <p className="admin-fin-page__eyebrow">Incident detail</p>
        <h2>{toAdminEnglish(item?.title || id)}</h2>
        <dl className="admin-incident-meta">
          <div>
            <dt>Type</dt>
            <dd>{toAdminEnglish(item?.kind || kind)}</dd>
          </div>
          <div>
            <dt>Status</dt>
            <dd>
              <span className={`admin-status admin-status--${item?.status || 'open'}`}>
                {mapAdminStatus(item?.status || 'open')}
              </span>
            </dd>
          </div>
          <div>
            <dt>Date / Time</dt>
            <dd>
              <time>{formatWhen(item?.at)}</time>
            </dd>
          </div>
          <div>
            <dt>ID</dt>
            <dd>
              <code>{id}</code>
            </dd>
          </div>
          {item?.score != null ? (
            <div>
              <dt>Health score</dt>
              <dd>{item.score}</dd>
            </div>
          ) : null}
          {item?.cycleId ? (
            <div>
              <dt>Cycle</dt>
              <dd>
                <code>{item.cycleId}</code>
              </dd>
            </div>
          ) : null}
        </dl>
      </section>

      <section className="admin-master__card">
        <h3>Description</h3>
        <pre className="admin-incident-block">
          {item?.description || 'No description available for this item yet.'}
        </pre>
      </section>

      <section className="admin-master__card">
        <h3>Logs</h3>
        {(item?.logs || []).length ? (
          <ul className="admin-incident-logs">
            {(item?.logs || []).map((log) => (
              <li key={log.id || log.message}>
                <span className="admin-feed__kind">{log.level || 'log'}</span>
                <span>{log.message}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="admin-master__lead">
            No structured logs attached. Re-run System Heal for fresh diagnostics when needed.
          </p>
        )}
      </section>

      <section className="admin-master__card">
        <h3>Quick actions</h3>
        <div className="admin-actions">
          <button
            type="button"
            className="admin-master__btn admin-master__btn--ghost"
            disabled={busy}
            onClick={onAcknowledge}
          >
            Acknowledge incident
          </button>
          <button
            type="button"
            className="admin-master__btn"
            disabled={busy || kind !== 'incident' || item?.resolved || item?.status === 'resolved'}
            onClick={() => void onResolve()}
          >
            Mark as Resolved
          </button>
        </div>
      </section>
    </div>
  );
}
