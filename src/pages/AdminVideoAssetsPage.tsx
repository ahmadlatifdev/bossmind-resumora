import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAdminAuth } from '../components/AdminAuthGate';
import VideoPlayer from '../components/AdminMultilingualVideoPlayer';
import {
  fetchAdminVideoAssets,
  fetchAdminVideoRegistry,
  restoreAdminVideo,
  type AdminRegistryVideo,
  type AdminVideoAsset,
} from '../lib/adminApi';
import { t } from '../lib/i18n.js';

export default function AdminVideoAssetsPage() {
  const { lang, password } = useAdminAuth();
  const [videos, setVideos] = useState<AdminVideoAsset[]>([]);
  const [registry, setRegistry] = useState<AdminRegistryVideo[]>([]);
  const [source, setSource] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(false);
  const [restoringId, setRestoringId] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [catalog, reg] = await Promise.all([
        fetchAdminVideoAssets(password),
        fetchAdminVideoRegistry(password, showArchived ? 'Archived' : 'Current'),
      ]);
      setVideos(Array.isArray(catalog.videos) ? catalog.videos : []);
      setSource(catalog.source ? String(catalog.source) : null);
      setRegistry(Array.isArray(reg.videos) ? reg.videos : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : t(lang, 'master.videosLoadFailed'));
      setVideos([]);
      setRegistry([]);
    } finally {
      setLoading(false);
    }
  }, [password, lang, showArchived]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onRestore(docId: string) {
    if (!docId) return;
    setRestoringId(docId);
    setNotice('');
    setError('');
    try {
      const out = await restoreAdminVideo(password, docId);
      setNotice(out.message || 'Restore successful');
      setShowArchived(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Restore failed');
    } finally {
      setRestoringId('');
    }
  }

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
        {' · '}
        <button
          type="button"
          className="admin-master__btn"
          onClick={() => setShowArchived((v) => !v)}
          disabled={loading}
        >
          {showArchived ? 'Hide Archived' : 'View Archived'}
        </button>
      </p>
      {error ? (
        <p className="admin-master__alert" role="alert">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="admin-master__lead" role="status">
          {notice}
        </p>
      ) : null}

      <section className="admin-master__card">
        <h2>{showArchived ? 'Archived registry' : 'Current registry'}</h2>
        <p className="admin-master__lead">
          Firestore <code>video_registry</code> —{' '}
          {showArchived ? 'Archived (restore available)' : 'Current only'}
        </p>
        {registry.length === 0 && !loading && !error ? (
          <p className="admin-master__lead">
            No {showArchived ? 'archived' : 'current'} registry videos.
          </p>
        ) : (
          <ul className="admin-video-registry">
            {registry.map((row) => {
              const id = row.doc_id || row.id || '';
              return (
                <li key={id || row.title} className="admin-video-registry__row">
                  <div>
                    <strong>{row.title || id || '—'}</strong>
                    <span className="admin-video-player__status"> {row.status}</span>
                    {row.archive_quarter ? (
                      <span className="admin-video-player__status"> · {row.archive_quarter}</span>
                    ) : null}
                    {row.active_url || row.archive_url ? (
                      <p
                        className="admin-video-player__src"
                        title={row.active_url || row.archive_url}
                      >
                        {row.archive_url || row.active_url}
                      </p>
                    ) : null}
                  </div>
                  {row.status === 'Archived' ? (
                    <button
                      type="button"
                      className="admin-master__btn"
                      disabled={Boolean(restoringId) || loading}
                      onClick={() => void onRestore(id)}
                    >
                      {restoringId === id ? 'Restoring…' : 'Restore'}
                    </button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="admin-master__card">
        <h2>{t(lang, 'master.videosTitle')}</h2>
        <p className="admin-master__lead">
          {t(lang, 'master.videosLead')}
          {source ? ` (${source})` : ''}
        </p>
        {videos.length === 0 && !loading && !error ? (
          <p className="admin-master__lead">{t(lang, 'master.videosEmpty')}</p>
        ) : (
          <div className="admin-video-grid">
            {videos.map((row) => (
              <VideoPlayer
                key={row.video_id || row.title}
                title={row.title || '—'}
                status={row.status}
                urls={row.urls || {}}
                durationSec={row.duration_sec}
                seriesId={row.series_id}
                scriptPath={row.script_path}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
