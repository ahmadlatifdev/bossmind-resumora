import React, { useState } from 'react';
import { localize } from '../lib/plans.js';
import { formatDuration, getVoiceoverScript } from '../lib/videoLibrary.js';
import { t, LANGS } from '../lib/i18n.js';
import VideoPlayer from './VideoPlayer';

export default function VideoCard({ video, uiLang, selected, busy, onPlay, onDownload }) {
  const [videoLang, setVideoLang] = useState(uiLang);
  const title = localize(video.title, uiLang);
  const description = localize(video.description, uiLang);
  const src = video.sources[videoLang] || video.sources.en;
  const voiceoverText = getVoiceoverScript(video, videoLang);

  return (
    <article className={`video-card${selected ? ' video-card--active' : ''}`}>
      <div className="video-card__media">
        <VideoPlayer
          src={src}
          title={title}
          voiceoverText={voiceoverText}
          lang={videoLang}
          autoNarrate
          preload={selected ? 'auto' : 'metadata'}
        />
      </div>
      <div className="video-card__body">
        <p className="video-card__duration" aria-label={t(uiLang, 'videos.duration')}>
          {formatDuration(video.durationSec)}
          {video.hasVoice ? ` · ${t(uiLang, 'videos.voiceoverTag')}` : ''}
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
