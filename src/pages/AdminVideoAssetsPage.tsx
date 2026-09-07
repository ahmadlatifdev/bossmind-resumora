import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAdminAuth } from '../components/AdminAuthGate';
import { fetchAdminVideoAssets, type AdminVideoAsset } from '../lib/adminApi';
import { t } from '../lib/i18n.js';

export default function AdminVideoAssetsPage() {
  const { lang, password } = useAdminAuth();
  const [videos, setVideos] = useState<AdminVideoAsset[]>([]);
  const [source, setSource] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await fetchAdminVideoAssets(password);
      setVideos(Array.isArray(data.videos) ? data.videos : []);
      setSource(data.source ? String(data.source) : null);
    } catch (err) {
      setError(err instanceof Error ? err.message : t(lang, 'master.videosLoadFailed'));
      setVideos([]);
    } finally {
      setLoading(false);
    }
  }, [password, lang]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="admin-dashboard">
      <p>
        <Link to="/admin/master">{t(lang, 'master.backOverview')}</Link>
        {' · '}
        <button
          type="button"
          className="admin-master__btn"
          onClick={() => void load()}
          disabled={loading}
        >
          {loading ? t(lang, 'master.videosLoading') : t(lang, 'heal.refresh')}
        </button>
      </p>
      {error ? (
        <p className="admin-master__alert" role="alert">
          {error}
        </p>
      ) : null}
      <section className="admin-master__card">
        <h2>{t(lang, 'master.videosTitle')}</h2>
        <p className="admin-master__lead">
          {t(lang, 'master.videosLead')}
          {source ? ` (${source})` : ''}
        </p>
        {videos.length === 0 && !loading && !error ? (
          <p className="admin-master__lead">{t(lang, 'master.videosEmpty')}</p>
        ) : (
          <div className="admin-table-wrap" style={{ overflowX: 'auto' }}>
            <table className="admin-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', padding: '8px' }}>
                    {t(lang, 'master.videosColTitle')}
                  </th>
                  <th style={{ textAlign: 'left', padding: '8px' }}>
                    {t(lang, 'master.videosColStatus')}
                  </th>
                  <th style={{ textAlign: 'left', padding: '8px' }}>
                    {t(lang, 'master.videosColBucket')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {videos.map((row) => (
                  <tr key={row.video_id || row.title}>
                    <td style={{ padding: '8px', borderTop: '1px solid rgba(212,175,55,0.2)' }}>
                      {row.title || '—'}
                    </td>
                    <td style={{ padding: '8px', borderTop: '1px solid rgba(212,175,55,0.2)' }}>
                      {row.status || '—'}
                    </td>
                    <td
                      style={{
                        padding: '8px',
                        borderTop: '1px solid rgba(212,175,55,0.2)',
                        fontFamily: 'ui-monospace, monospace',
                        fontSize: '0.85em',
                        wordBreak: 'break-all',
                      }}
                    >
                      {row.bucket_path || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
