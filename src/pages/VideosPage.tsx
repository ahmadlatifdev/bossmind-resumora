// @ts-nocheck — legacy video library page; gated by ProtectedRoute / auth
import React, { useEffect, useMemo, useState } from 'react';
import VideoCard from '../components/VideoCard';
import { t, tFormat } from '../lib/i18n.js';
import { useLangOptional } from '../i18n/LangContext';
import { VIDEO_LIBRARY, MAX_VIDEO_DOWNLOADS } from '../lib/videoLibrary.js';
import { remainingVideoDownloads, recordVideoDownload, downloadMp4 } from '../lib/userAccess.js';
import { localize } from '../lib/plans.js';
import { fetchVideoCatalog, searchVideos } from '../lib/videoApi.js';

function mapCatalogItem(item) {
  const id = item.video_id || item.id;
  return {
    id,
    order: item.order || 0,
    durationSec: item.duration || 480,
    title: {
      en: item.title_EN || item.title?.en || id,
      fr: item.title_FR || item.title?.fr || item.title_EN || id,
      es: item.title_ES || item.title?.es || item.title_EN || id,
    },
    description: {
      en: item.description_EN || item.description?.en || '',
      fr: item.description_FR || item.description?.fr || '',
      es: item.description_ES || item.description?.es || '',
    },
    voiceover: item.voiceover || {
      en: item.voiceover_en || item.description_EN || item.description?.en || '',
      fr: item.voiceover_fr || item.description_FR || item.description?.fr || '',
      es: item.voiceover_es || item.description_ES || item.description?.es || '',
    },
    hasVoice: item.hasVoice !== false,
    sources: {
      en: item.urls?.en || item.url_mp4_en || item.sources?.en || '',
      fr: item.urls?.fr || item.url_mp4_fr || item.sources?.fr || item.url_mp4_en || '',
      es: item.urls?.es || item.url_mp4_es || item.sources?.es || item.url_mp4_en || '',
    },
    downloadName: {
      en: `resumora-${id}-en.mp4`,
      fr: `resumora-${id}-fr.mp4`,
      es: `resumora-${id}-es.mp4`,
    },
    source: item.source || 'catalog',
  };
}

export default function VideosPage() {
  const { lang } = useLangOptional();
  const [remaining, setRemaining] = useState(() => remainingVideoDownloads());
  const [library, setLibrary] = useState(VIDEO_LIBRARY);
  const [catalogMeta, setCatalogMeta] = useState({ bilibiliConfigured: false, source: 'local' });
  const [activeId, setActiveId] = useState(VIDEO_LIBRARY[0].id);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchHits, setSearchHits] = useState(null);
  const [searchBusy, setSearchBusy] = useState(false);
  const [searchError, setSearchError] = useState('');

  useEffect(() => {
    let cancelled = false;
    fetchVideoCatalog()
      .then((data) => {
        if (cancelled) return;
        const videos = Array.isArray(data.videos) ? data.videos.map(mapCatalogItem) : [];
        if (videos.length) {
          setLibrary(videos);
          setActiveId(videos[0].id);
        }
        setCatalogMeta({
          bilibiliConfigured: Boolean(data.bilibiliConfigured),
          source: data.source || 'api',
          note: data.note || '',
        });
      })
      .catch(() => {
        /* keep local VIDEO_LIBRARY */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const q = searchQuery.trim();
    if (!q) {
      setSearchHits(null);
      setSearchError('');
      return undefined;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      setSearchBusy(true);
      setSearchError('');
      searchVideos(q, 20)
        .then((data) => {
          if (cancelled) return;
          setSearchHits(Array.isArray(data.results) ? data.results : []);
        })
        .catch((err) => {
          if (cancelled) return;
          setSearchHits([]);
          setSearchError(err?.message || 'Search failed');
        })
        .finally(() => {
          if (!cancelled) setSearchBusy(false);
        });
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [searchQuery]);

  const visibleLibrary = useMemo(() => {
    if (!searchHits) return library;
    if (!searchHits.length) return [];
    const byId = new Map(library.map((v) => [v.id, v]));
    return searchHits
      .map((hit) => {
        const existing = byId.get(hit.id);
        if (existing) return existing;
        return {
          id: hit.id || hit.title,
          order: 0,
          durationSec: 480,
          title: { en: hit.title || hit.id, fr: hit.title || hit.id, es: hit.title || hit.id },
          description: {
            en: hit.summary || '',
            fr: hit.summary || '',
            es: hit.summary || '',
          },
          voiceover: { en: hit.summary || '', fr: hit.summary || '', es: hit.summary || '' },
          hasVoice: false,
          sources: { en: hit.active_url || '', fr: hit.active_url || '', es: hit.active_url || '' },
          downloadName: {
            en: `resumora-${hit.id}-en.mp4`,
            fr: `resumora-${hit.id}-fr.mp4`,
            es: `resumora-${hit.id}-es.mp4`,
          },
          source: 'search',
        };
      })
      .filter(Boolean);
  }, [library, searchHits]);

  const firstSrc = useMemo(() => visibleLibrary[0]?.sources?.en || '', [visibleLibrary]);

  useEffect(() => {
    if (!firstSrc || typeof document === 'undefined') return undefined;
    const link = document.createElement('link');
    link.rel = 'preload';
    link.as = 'video';
    link.href = firstSrc;
    document.head.appendChild(link);
    return () => {
      link.remove();
    };
  }, [firstSrc]);

  async function onPlay(video) {
    setActiveId(video.id);
    setNotice('');
    setError('');
  }

  async function onDownload(video, videoLang) {
    setBusy(true);
    setNotice('');
    setError('');
    try {
      const result = await recordVideoDownload({
        videoId: video.id,
        language: videoLang,
        action: 'download',
      });
      setRemaining(result.remaining);
      if (!result.ok) {
        setError(t(lang, 'videos.limitReached'));
        return;
      }
      const url = video.sources[videoLang] || video.sources.en;
      const filename =
        localize(video.downloadName, videoLang) || `resumora-${video.id}-${videoLang}.mp4`;
      await downloadMp4(url, filename);
      setNotice(
        result.reused
          ? t(lang, 'videos.downloaded')
          : `${t(lang, 'videos.downloaded')} (${result.remaining}/${MAX_VIDEO_DOWNLOADS})`
      );
    } catch (err) {
      setError(err?.message || t(lang, 'videos.downloadFailed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="app-main page-content">
      <h1>{t(lang, 'videos.title')}</h1>
      <p className="lead">{t(lang, 'videos.lead')}</p>
      <p className="plan-chip">
        {t(lang, 'videos.remaining')}:{' '}
        <strong>
          {remaining}/{MAX_VIDEO_DOWNLOADS}
        </strong>
      </p>

      <label
        className="video-search"
        htmlFor="video-search-input"
        style={{ display: 'block', margin: '12px 0' }}
      >
        <span className="sr-only">Search videos</span>
        <input
          id="video-search-input"
          type="search"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search videos"
          autoComplete="off"
          aria-controls="video-search-results"
          style={{
            width: '100%',
            maxWidth: 480,
            padding: '10px 12px',
            borderRadius: 8,
            border: '1px solid rgba(212, 175, 55, 0.35)',
            background: 'rgba(0,0,0,0.35)',
            color: 'inherit',
          }}
        />
        {searchBusy ? <span className="muted small"> Searching…</span> : null}
      </label>
      {searchError ? (
        <p className="banner err" role="alert">
          {searchError}
        </p>
      ) : null}
      {searchHits && !searchBusy ? (
        <p className="muted small" id="video-search-results" role="status">
          {searchHits.length} search result{searchHits.length === 1 ? '' : 's'}
        </p>
      ) : null}

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

      <section className="video-grid" aria-label={t(lang, 'videos.title')}>
        {visibleLibrary.map((video) => (
          <VideoCard
            key={video.id}
            video={video}
            uiLang={lang}
            selected={activeId === video.id}
            busy={busy}
            onPlay={onPlay}
            onDownload={onDownload}
          />
        ))}
      </section>

      <p className="muted small" style={{ marginTop: 20 }}>
        {catalogMeta.bilibiliConfigured
          ? tFormat(lang, 'videos.bilibiliConfigured', { source: catalogMeta.source })
          : t(lang, 'videos.bilibiliNote')}
      </p>
    </div>
  );
}
