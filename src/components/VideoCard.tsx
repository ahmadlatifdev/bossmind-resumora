import React, { useEffect, useMemo, useState } from 'react';
import { localize } from '../lib/plans.js';
import { formatDuration, getVoiceoverScript, resolveCaptionTracks } from '../lib/videoLibrary.js';
import { t, LANGS } from '../lib/i18n.js';
import VideoPlayer from './VideoPlayer';

export default function VideoCard({ video, uiLang, selected, busy, onPlay, onDownload }) {
  const [videoLang, setVideoLang] = useState(uiLang);

  // Keep audio/captions language aligned when the page EN/FR/ES switcher changes.
  useEffect(() => {
    setVideoLang(uiLang);
  }, [uiLang]);

  const title = localize(video.title, uiLang);
  const description = localize(video.description, uiLang);
  const src =
    video.sources[videoLang] || video.sources.en || video.sources.fr || video.sources.es || '';
  const enSrc = video.sources.en || '';
  const hasDedicatedDub = videoLang === 'en' || Boolean(src && enSrc && src !== enSrc);
  const localizeStatus = String(video.localizeStatus?.[videoLang] || '').toLowerCase();
  const generationFailed =
    String(video.generationStatus || video.status || '').toLowerCase() === 'generation_failed';
  const dubBadge = generationFailed
    ? t(uiLang, 'videos.temporarilyUnavailable')
    : videoLang === 'en'
      ? null
      : localizeStatus === 'processing' || localizeStatus === 'queued'
        ? t(uiLang, 'videos.localizing')
        : hasDedicatedDub
          ? t(uiLang, 'videos.localized')
          : t(uiLang, 'videos.comingSoon');
  const voiceoverText = getVoiceoverScript(video, videoLang);
  const captions = useMemo(() => resolveCaptionTracks(video), [video]);
  const playerSrc = generationFailed ? '' : src;

  return (
    <article className={`video-card${selected ? ' video-card--active' : ''}`}>
      <div className="video-card__media">
        <VideoPlayer
          src={playerSrc}
          title={title}
          videoId={video.id}
          voiceoverText={generationFailed ? '' : voiceoverText}
          lang={videoLang}
          uiLang={uiLang}
          captions={generationFailed ? {} : captions}
          autoNarrate={!generationFailed}
          preload={selected ? 'auto' : 'metadata'}
        />
        {generationFailed ? (
          <p className="video-card__unavailable" role="status">
            {t(uiLang, 'videos.temporarilyUnavailable')}
          </p>
        ) : null}
      </div>
      <div className="video-card__body">
        <p className="video-card__duration" aria-label={t(uiLang, 'videos.duration')}>
          {formatDuration(video.durationSec)}
          {video.hasVoice ? ` · ${t(uiLang, 'videos.voiceTag')}` : ''}
          {dubBadge ? (
            <span
              className={`video-card__dub-badge${hasDedicatedDub ? ' video-card__dub-badge--ok' : ' video-card__dub-badge--pending'}`}
              title={hasDedicatedDub ? t(uiLang, 'videos.localized') : t(uiLang, 'videos.fallback')}
            >
              {' · '}
              {dubBadge}
            </span>
          ) : null}
        </p>
        <h2>{title}</h2>
        <p className="video-card__desc">{description}</p>
        <div className="video-card__lang" role="group" aria-label={t(uiLang, 'videos.audioLang')}>
          {LANGS.map((code) => (
            <button
              key={code}
              type="button"
              className="lang-btn"
              data-active={videoLang === code}
              aria-pressed={videoLang === code}
              onClick={() => setVideoLang(code)}
            >
              {code.toUpperCase()}
            </button>
          ))}
        </div>
        <div className="video-card__actions">
          <button
            type="button"
            className="primary"
            disabled={busy}
            aria-label={`${t(uiLang, 'videos.play')} — ${title}`}
            onClick={() => onPlay(video, videoLang)}
          >
            {t(uiLang, 'videos.play')}
          </button>
          <button
            type="button"
            className="secondary"
            disabled={busy}
            aria-label={`${t(uiLang, 'videos.download')} — ${title}`}
            onClick={() => onDownload(video, videoLang)}
          >
            {t(uiLang, 'videos.download')}
          </button>
        </div>
      </div>
    </article>
  );
}
