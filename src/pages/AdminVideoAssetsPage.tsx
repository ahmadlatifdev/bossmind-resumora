import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAdminAuth } from '../components/AdminAuthGate';
import VideoPlayer from '../components/AdminMultilingualVideoPlayer';
import {
  fetchAdminVideoAssets,
  fetchAdminVideoRegistry,
  fetchAdminVideoSignedUrl,
  restoreAdminVideo,
  updateAdminRegistryVideo,
  type AdminRegistryVideo,
  type AdminVideoAsset,
} from '../lib/adminApi';
import { t } from '../lib/i18n.js';

function registryLabel(row: AdminRegistryVideo, videoNumber: number) {
  const named = String(row.display_name || row.label || '').trim();
  if (named) return named;
  return `Video ${videoNumber}`;
}

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
  const [selectedId, setSelectedId] = useState('');
  const [running, setRunning] = useState(false);
  const [editingId, setEditingId] = useState('');
  const [editName, setEditName] = useState('');
  const [savingId, setSavingId] = useState('');

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
      const rows = Array.isArray(reg.videos) ? reg.videos : [];
      setRegistry(rows);
      setSelectedId((prev) => (prev && rows.some((r) => (r.doc_id || r.id) === prev) ? prev : ''));
    } catch (err) {
      setError(err instanceof Error ? err.message : t(lang, 'master.videosLoadFailed'));
      setVideos([]);
      setRegistry([]);
      setSelectedId('');
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

  function startEdit(row: AdminRegistryVideo) {
    const id = row.doc_id || row.id || '';
    if (!id) return;
    setEditingId(id);
    setEditName(String(row.display_name || '').trim());
    setNotice('');
    setError('');
  }

  function cancelEdit() {
    setEditingId('');
    setEditName('');
  }

  async function saveDisplayName(docId: string) {
    if (!docId) return;
    setSavingId(docId);
    setError('');
    setNotice('');
    try {
      const out = await updateAdminRegistryVideo(password, docId, {
        display_name: editName.trim(),
      });
      const updated = out.video;
      if (updated) {
        setRegistry((rows) =>
          rows.map((r) => ((r.doc_id || r.id) === docId ? { ...r, ...updated } : r))
        );
      } else {
        await load();
      }
      setNotice('Display name saved');
      cancelEdit();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSavingId('');
    }
  }

  async function onRunSelected() {
    if (!selectedId || running) return;
    setRunning(true);
    setError('');
    setNotice('');
    try {
      const row = registry.find((r) => (r.doc_id || r.id) === selectedId);
      const gsUrl = String(row?.active_url || row?.archive_url || '').trim();
      if (!gsUrl && !selectedId) {
        throw new Error('Selected video has no GCS path');
      }
      const out = await fetchAdminVideoSignedUrl(password, selectedId, gsUrl || undefined);
      const href = String(out.signedUrl || '').trim();
      if (!href) throw new Error('No signed URL returned');
      const opened = window.open(href, '_blank', 'noopener,noreferrer');
      if (!opened) {
        throw new Error('Popup blocked — allow popups for this site and try again');
      }
      setNotice('Opened signed playback URL in a new tab (expires in 15 minutes).');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Playback failed');
    } finally {
      setRunning(false);
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
        {' · '}
        <button
          type="button"
          className="admin-master__btn admin-master__btn--run"
          onClick={() => void onRunSelected()}
          disabled={!selectedId || running || loading}
          title={
            selectedId
              ? 'Generate a temporary signed URL and open playback'
              : 'Select a video first'
          }
        >
          {running ? 'Opening…' : '▶ Run Selected'}
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
        <h2>{showArchived ? 'Archived registry' : 'Video Playback & Registry'}</h2>
        <p className="admin-master__lead">
          Firestore <code>video_registry</code> —{' '}
          {showArchived
            ? 'Archived (restore available)'
            : 'Select a row, then Run Selected for a temporary signed playback URL'}
        </p>
        {registry.length === 0 && !loading && !error ? (
          <p className="admin-master__lead">
            No {showArchived ? 'archived' : 'current'} registry videos.
          </p>
        ) : (
          <ul className="admin-video-registry">
            {registry.map((row, index) => {
              const id = row.doc_id || row.id || '';
              const videoNumber = index + 1;
              const selected = Boolean(id) && selectedId === id;
              const editing = Boolean(id) && editingId === id;
              const label = registryLabel(row, videoNumber);
              const techName = String(row.title || '').trim();
              return (
                <li
                  key={id || row.title || `video-${videoNumber}`}
                  className={
                    selected
                      ? 'admin-video-registry__row admin-video-registry__row--selected'
                      : 'admin-video-registry__row'
                  }
                >
                  <label className="admin-video-registry__select">
                    <input
                      type="checkbox"
                      checked={selected}
                      disabled={!id || loading}
                      onChange={() => setSelectedId((prev) => (prev === id ? '' : id))}
                      aria-label={`Select ${label}`}
                    />
                  </label>
                  <div
                    className="admin-video-registry__main"
                    role="button"
                    tabIndex={0}
                    onClick={() => {
                      if (!id || editing) return;
                      setSelectedId((prev) => (prev === id ? '' : id));
                    }}
                    onKeyDown={(e) => {
                      if (!id || editing) return;
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setSelectedId((prev) => (prev === id ? '' : id));
                      }
                    }}
                  >
                    <span className="admin-video-registry__play" aria-hidden="true">
                      ▶
                    </span>
                    <div className="admin-video-registry__text">
                      {editing ? (
                        <div
                          className="admin-video-registry__edit"
                          onClick={(e) => e.stopPropagation()}
                          onKeyDown={(e) => e.stopPropagation()}
                        >
                          <input
                            type="text"
                            className="admin-video-registry__input"
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            placeholder="Display name"
                            disabled={savingId === id}
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                void saveDisplayName(id);
                              }
                              if (e.key === 'Escape') {
                                e.preventDefault();
                                cancelEdit();
                              }
                            }}
                          />
                          <button
                            type="button"
                            className="admin-master__btn"
                            disabled={savingId === id}
                            onClick={() => void saveDisplayName(id)}
                          >
                            {savingId === id ? 'Saving…' : 'Save'}
                          </button>
                          <button
                            type="button"
                            className="admin-master__btn"
                            disabled={savingId === id}
                            onClick={cancelEdit}
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <div className="admin-video-registry__title-line">
                          <span className="admin-video-registry__num">#{videoNumber}</span>
                          <strong>{label}</strong>
                          <button
                            type="button"
                            className="admin-video-registry__pencil"
                            title="Edit display name"
                            aria-label={`Edit display name for ${label}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              startEdit(row);
                            }}
                          >
                            ✎
                          </button>
                          <span className="admin-video-player__status"> {row.status}</span>
                          {row.archive_quarter ? (
                            <span className="admin-video-player__status">
                              {' '}
                              · {row.archive_quarter}
                            </span>
                          ) : null}
                        </div>
                      )}
                      {techName && techName !== label ? (
                        <p className="admin-video-registry__tech" title={techName}>
                          {techName}
                        </p>
                      ) : null}
                      {row.description ? (
                        <p className="admin-video-registry__desc">{row.description}</p>
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
