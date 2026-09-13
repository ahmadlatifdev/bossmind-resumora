// @ts-nocheck — legacy video library page; gated by ProtectedRoute / auth
import React, { useEffect, useMemo, useRef, useState } from 'react';
import VideoCard from '../components/VideoCard';
import { t, tFormat } from '../lib/i18n.js';
import { useLangOptional } from '../i18n/LangContext';
import { VIDEO_LIBRARY, MAX_VIDEO_DOWNLOADS } from '../lib/videoLibrary.js';
import { remainingVideoDownloads, recordVideoDownload, downloadMp4 } from '../lib/userAccess.js';
import { localize } from '../lib/plans.js';
import { fetchVideoCatalog } from '../lib/videoApi.js';

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
  const [playingVideo, setPlayingVideo] = useState(null);
  const [playingLang, setPlayingLang] = useState(lang);
  const modalVideoRef = useRef(null);

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

  const firstSrc = useMemo(() => library[0]?.sources?.en || '', [library]);

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

  async function onPlay(video, videoLang) {
    setActiveId(video.id);
    setPlayingVideo(video);
    setPlayingLang(videoLang || lang);
    setNotice('');
    setError('');
  }

  function closeVideoModal() {
    setPlayingVideo(null);
  }

  useEffect(() => {
    if (!playingVideo) return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeVideoModal();
      } else if (event.code === 'Space' && event.target === document.body) {
        event.preventDefault();
        const video = modalVideoRef.current;
        if (!video) return;
        if (video.paused) video.play();
        else video.pause();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = '';
    };
  }, [playingVideo]);

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
        {library.map((video) => (
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

      {playingVideo ? (
        <div
          className="video-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="video-modal-title"
          onClick={(event) => {
            if (event.target === event.currentTarget) closeVideoModal();
          }}
        >
          <div className="video-modal__panel">
            <header className="video-modal__header">
              <h2 id="video-modal-title">{localize(playingVideo.title, lang)}</h2>
              <button
                type="button"
                className="video-modal__close"
                onClick={closeVideoModal}
                aria-label={t(lang, 'nav.close')}
              >
                {t(lang, 'nav.close')}
              </button>
            </header>
            <video
              ref={modalVideoRef}
              className="video-modal__player"
              src={playingVideo.sources[playingLang] || playingVideo.sources.en}
              controls
              autoPlay
              playsInline
              aria-label={localize(playingVideo.title, lang)}
            />
            <p className="video-modal__hint muted small">Space: play/pause · Esc: close</p>
          </div>
        </div>
      ) : null}

      <p className="muted small" style={{ marginTop: 20 }}>
        {catalogMeta.bilibiliConfigured
          ? tFormat(lang, 'videos.bilibiliConfigured', { source: catalogMeta.source })
          : t(lang, 'videos.bilibiliNote')}
      </p>
    </div>
  );
}
