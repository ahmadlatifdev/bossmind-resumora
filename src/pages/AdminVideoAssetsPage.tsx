import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAdminAuth } from '../components/AdminAuthGate';
import VideoPlayer from '../components/AdminMultilingualVideoPlayer';
import {
  fetchAdminVideoAssets,
  fetchAdminVideoMetadata,
  fetchAdminVideoRegistry,
  queueAdminVideoEnrichment,
  restoreAdminVideo,
  type AdminRegistryVideo,
  type AdminVideoAsset,
  type AdminVideoMetadata,
} from '../lib/adminApi';
import { t } from '../lib/i18n.js';

function EnrichmentBadge({ status }: { status?: string }) {
  const s = String(status || '').toLowerCase();
  if (!s) return null;
  let label = s;
  let tone = 'idle';
  if (s === 'processing' || s === 'queued') {
    label = 'Processing';
    tone = 'processing';
  } else if (s === 'ready') {
    label = 'Enriched';
    tone = 'ready';
  } else if (s === 'failed') {
    label = 'Failed';
    tone = 'failed';
  }
  return (
    <span className={`admin-enrichment-badge admin-enrichment-badge--${tone}`} role="status">
      {label}
    </span>
  );
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
  const [detailId, setDetailId] = useState('');
  const [detailMeta, setDetailMeta] = useState<AdminVideoMetadata | null>(null);
  const [detailStatus, setDetailStatus] = useState('');
  const [detailError, setDetailError] = useState('');
  const [detailLoading, setDetailLoading] = useState(false);
  const [enrichingId, setEnrichingId] = useState('');

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

  async function openDetail(docId: string) {
    if (!docId) return;
    setDetailId(docId);
    setDetailLoading(true);
    setDetailMeta(null);
    setDetailStatus('');
    setDetailError('');
    try {
      const out = await fetchAdminVideoMetadata(password, docId);
      setDetailStatus(String(out.enrichment_status || ''));
      setDetailError(String(out.enrichment_error || ''));
      setDetailMeta(out.metadata || null);
    } catch (err) {
      setDetailError(err instanceof Error ? err.message : 'Metadata load failed');
    } finally {
      setDetailLoading(false);
    }
  }

  async function onEnrich(docId: string) {
    if (!docId) return;
    setEnrichingId(docId);
    setNotice('');
    setError('');
    try {
      const out = await queueAdminVideoEnrichment(password, docId);
      setNotice(out.message || 'Enrichment queued');
      await load();
      if (detailId === docId) await openDetail(docId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Enrich queue failed');
    } finally {
      setEnrichingId('');
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
          {showArchived ? 'Archived (restore available)' : 'Current only'} · enrichment badges from
          Pillar 2
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
                    <EnrichmentBadge status={row.enrichment_status} />
                    {row.archive_quarter ? (
                      <span className="admin-video-player__status"> · {row.archive_quarter}</span>
                    ) : null}
                    {row.enrichment_summary ? (
                      <p className="admin-video-player__src">{row.enrichment_summary}</p>
                    ) : null}
                    {row.enrichment_tags && row.enrichment_tags.length > 0 ? (
                      <p className="admin-enrichment-tags">
                        {row.enrichment_tags.slice(0, 8).join(' · ')}
                      </p>
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
                  <div className="admin-video-registry__actions">
                    <button
                      type="button"
                      className="admin-master__btn"
                      disabled={loading || detailLoading}
                      onClick={() => void openDetail(id)}
                    >
                      Metadata
                    </button>
                    {row.status === 'Current' ? (
                      <button
                        type="button"
                        className="admin-master__btn"
                        disabled={Boolean(enrichingId) || loading}
                        onClick={() => void onEnrich(id)}
                      >
                        {enrichingId === id ? 'Queuing…' : 'Enrich'}
                      </button>
                    ) : null}
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
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {detailId ? (
        <section className="admin-master__card" aria-labelledby="admin-video-meta-heading">
          <h2 id="admin-video-meta-heading">Video metadata · {detailId}</h2>
          <p className="admin-master__lead">
            Status: <EnrichmentBadge status={detailStatus} />{' '}
            {detailStatus ? `(${detailStatus})` : 'none'}
          </p>
          {detailLoading ? <p className="admin-master__lead">Loading metadata…</p> : null}
          {detailError ? (
            <p className="admin-master__alert" role="alert">
              {detailError}
            </p>
          ) : null}
          {!detailLoading && detailMeta ? (
            <div className="admin-video-metadata">
              {detailMeta.summary ? (
                <>
                  <h3>Summary</h3>
                  <p>{detailMeta.summary}</p>
                </>
              ) : null}
              {detailMeta.tags && detailMeta.tags.length > 0 ? (
                <>
                  <h3>Tags</h3>
                  <p className="admin-enrichment-tags">{detailMeta.tags.join(' · ')}</p>
                </>
              ) : null}
              {detailMeta.chapters && detailMeta.chapters.length > 0 ? (
                <>
                  <h3>Chapters</h3>
                  <ol className="admin-video-chapters">
                    {detailMeta.chapters.map((ch, i) => (
                      <li key={`${ch.timestamp}-${i}`}>
                        <code>{ch.timestamp || '—'}</code> {ch.title || 'Chapter'}
                      </li>
                    ))}
                  </ol>
                </>
              ) : null}
              {detailMeta.transcript ? (
                <>
                  <h3>Transcript</h3>
                  <pre className="admin-video-transcript">
                    {detailMeta.transcript.slice(0, 4000)}
                  </pre>
                </>
              ) : (
                <p className="admin-master__lead">
                  Transcript pending (Speech-to-Text deferred until video-processor).
                </p>
              )}
              {detailMeta.thumbnail_pending ? (
                <p className="admin-master__lead">
                  Thumbnail extraction deferred (FFmpeg / Phase 4).
                </p>
              ) : null}
            </div>
          ) : null}
          {!detailLoading && !detailMeta && !detailError ? (
            <p className="admin-master__lead">No enrichment document yet. Use Enrich to queue.</p>
          ) : null}
          <button type="button" className="admin-master__btn" onClick={() => setDetailId('')}>
            Close detail
          </button>
        </section>
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
