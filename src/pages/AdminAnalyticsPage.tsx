import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAdminAuth } from '../components/AdminAuthGate';
import { fetchAdminAnalytics, type AdminAnalyticsSnapshot } from '../lib/adminApi';
import { t } from '../lib/i18n.js';

function ViewBars({
  items,
}: {
  items: Array<{ id?: string; title?: string; viewCount?: number }>;
}) {
  if (!items.length) {
    return (
      <p className="admin-master__lead">
        No view counts yet. Counts appear when <code>viewCount</code> is set on registry docs or{' '}
        <code>watch_events</code> are recorded.
      </p>
    );
  }
  const max = Math.max(1, ...items.map((i) => Number(i.viewCount || 0)));
  return (
    <ul className="admin-analytics-bars" aria-label="Top videos by views">
      {items.map((item) => {
        const views = Number(item.viewCount || 0);
        const pct = Math.round((views / max) * 100);
        return (
          <li key={item.id || item.title}>
            <div className="admin-analytics-bars__label">
              <strong>{item.title || item.id || '—'}</strong>
              <span>{views}</span>
            </div>
            <div className="admin-analytics-bars__track" aria-hidden="true">
              <div className="admin-analytics-bars__fill" style={{ width: `${pct}%` }} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export default function AdminAnalyticsPage() {
  const { lang, password } = useAdminAuth();
  const [latest, setLatest] = useState<AdminAnalyticsSnapshot | null>(null);
  const [history, setHistory] = useState<AdminAnalyticsSnapshot[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(
    async (refresh = false) => {
      setLoading(true);
      setError('');
      try {
        const out = await fetchAdminAnalytics(password, { refresh, limit: 30 });
        setLatest(out.latest || null);
        setHistory(Array.isArray(out.snapshots) ? out.snapshots : []);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Analytics load failed');
        setLatest(null);
        setHistory([]);
      } finally {
        setLoading(false);
      }
    },
    [password]
  );

  useEffect(() => {
    void load(false);
  }, [load]);

  return (
    <div className="admin-dashboard">
      <p>
        <Link to="/admin/master">{t(lang, 'master.backOverview')}</Link>
        {' · '}
        <button
          type="button"
          className="admin-master__btn"
          onClick={() => void load(false)}
          disabled={loading}
        >
          {loading ? t(lang, 'master.videosLoading') : t(lang, 'heal.refresh')}
        </button>
        {' · '}
        <button
          type="button"
          className="admin-master__btn"
          onClick={() => void load(true)}
          disabled={loading}
        >
          Recompute now
        </button>
      </p>

      {error ? (
        <p className="admin-master__alert" role="alert">
          {error}
        </p>
      ) : null}

      <section className="admin-master__card">
        <h2>Admin Analytics</h2>
        <p className="admin-master__lead">
          Daily snapshots in Firestore <code>admin_analytics</code> (hourly scheduler + on-demand
          refresh). Active users / watch counts require <code>user_profiles</code> /{' '}
          <code>watch_events</code>; video counts always use <code>video_registry</code>.
        </p>
        {!latest && !loading && !error ? (
          <p className="admin-master__lead">No snapshots yet. Click Recompute now.</p>
        ) : null}
        {latest ? (
          <div className="admin-analytics-kpis">
            <div className="admin-analytics-kpi">
              <h3>Active users (7d)</h3>
              <p className="admin-analytics-kpi__value">{latest.activeUsers ?? 0}</p>
            </div>
            <div className="admin-analytics-kpi">
              <h3>Watched today</h3>
              <p className="admin-analytics-kpi__value">{latest.watchCount ?? 0}</p>
            </div>
            <div className="admin-analytics-kpi">
              <h3>Current videos</h3>
              <p className="admin-analytics-kpi__value">{latest.videosCurrent ?? 0}</p>
            </div>
            <div className="admin-analytics-kpi">
              <h3>Archived</h3>
              <p className="admin-analytics-kpi__value">{latest.videosArchived ?? 0}</p>
            </div>
          </div>
        ) : null}
        {latest?.enrichment ? (
          <p className="admin-master__lead">
            Enrichment — ready: {latest.enrichment.ready || 0} · processing:{' '}
            {latest.enrichment.processing || 0} · failed: {latest.enrichment.failed || 0} · metadata
            docs: {latest.videoMetadataCount || 0}
          </p>
        ) : null}
        {latest?.date ? (
          <p className="admin-master__lead muted">Snapshot date: {latest.date}</p>
        ) : null}
      </section>

      <section className="admin-master__card">
        <h2>Top videos</h2>
        <ViewBars items={latest?.topVideos || []} />
      </section>

      {history.length > 1 ? (
        <section className="admin-master__card">
          <h2>Recent snapshots</h2>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th scope="col">Date</th>
                  <th scope="col">Active 7d</th>
                  <th scope="col">Watched</th>
                  <th scope="col">Current</th>
                  <th scope="col">Archived</th>
                </tr>
              </thead>
              <tbody>
                {history.map((row) => (
                  <tr key={row.id || row.date}>
                    <td>{row.date}</td>
                    <td>{row.activeUsers ?? 0}</td>
                    <td>{row.watchCount ?? 0}</td>
                    <td>{row.videosCurrent ?? 0}</td>
                    <td>{row.videosArchived ?? 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  );
}
