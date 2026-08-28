// @ts-nocheck — legacy video library page; gated by ProtectedRoute / auth
import React, { useEffect, useMemo, useState } from 'react';
import SiteHeader from '../components/SiteHeader';
import VideoCard from '../components/VideoCard';
import { getLang, setLang, t } from '../lib/i18n.js';
import { VIDEO_LIBRARY, MAX_VIDEO_DOWNLOADS } from '../lib/videoLibrary.js';
import { remainingVideoDownloads, recordVideoDownload, downloadMp4 } from '../lib/userAccess.js';
import { localize } from '../lib/plans.js';
import { fetchVideoCatalog } from '../lib/heygen.js';

function mapCatalogItem(item) {
  const id = item.video_id || item.id;
  return {
    id,
    order: item.order || 0,
    durationSec: item.duration || 300,
    title: {
      en: item.title_EN || item.title_en || item.title?.en || id,
      fr: item.title_FR || item.title_fr || item.title?.fr || item.title_EN || item.title_en || id,
      es: item.title_ES || item.title_es || item.title?.es || item.title_EN || item.title_en || id,
    },
    description: {
      en: item.description_EN || item.description_en || item.description?.en || '',
      fr: item.description_FR || item.description_fr || item.description?.fr || '',
      es: item.description_ES || item.description_es || item.description?.es || '',
    },
    voiceover: item.voiceover || {
      en: item.voiceover_en || item.description_EN || item.description?.en || '',
      fr: item.voiceover_fr || item.description_FR || item.description?.fr || '',
      es: item.voiceover_es || item.description_ES || item.description?.es || '',
    },
    captions: {
      en: item.captions_en || item.captions?.en || '',
      fr: item.captions_fr || item.captions?.fr || '',
      es: item.captions_es || item.captions?.es || '',
    },
    hasVoice: item.hasVoice !== false,
    sources: {
      en: item.url_mp4_en || item.sources?.en || '',
      fr: item.url_mp4_fr || item.sources?.fr || item.url_mp4_en || '',
      es: item.url_mp4_es || item.sources?.es || item.url_mp4_en || '',
    },
    localizeStatus: {
      fr: item.localize_status_fr || item.localizeStatus?.fr || '',
      es: item.localize_status_es || item.localizeStatus?.es || '',
    },
    generationStatus: item.status || item.generation_status || '',
    downloadName: {
      en: `resumora-${id}-en.mp4`,
      fr: `resumora-${id}-fr.mp4`,
      es: `resumora-${id}-es.mp4`,
    },
    source: item.source || 'catalog',
  };
}

export default function VideosPage() {
  const [lang, setLangState] = useState(() => getLang());
  const [remaining, setRemaining] = useState(() => remainingVideoDownloads());
  const [library, setLibrary] = useState(VIDEO_LIBRARY);
  const [catalogMeta, setCatalogMeta] = useState({ heygenConfigured: false, source: 'local' });
  const [activeId, setActiveId] = useState(VIDEO_LIBRARY[0].id);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

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
          heygenConfigured: Boolean(data.heygenConfigured),
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

  function switchLang(next) {
    setLangState(setLang(next));
  }

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
    <div className="app-shell">
      <SiteHeader lang={lang} onLangChange={switchLang} currentPath="/videos" showLang />

      <main className="app-main">
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

        <p className="muted small" style={{ marginTop: 20 }}>
          {catalogMeta.heygenConfigured
            ? t(lang, 'videos.heygenConfigured').replace(
                '{source}',
                String(catalogMeta.source || 'api')
              )
            : t(lang, 'videos.heygenNote')}
        </p>
      </main>
    </div>
  );
}
