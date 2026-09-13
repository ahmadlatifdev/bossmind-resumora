import React, { useState } from 'react';
import { localize } from '../lib/plans.js';
import { t, LANGS } from '../lib/i18n.js';

export default function VideoCard({ video, uiLang }) {
  const [videoLang, setVideoLang] = useState(uiLang);
  const title = localize(video.title, uiLang);
  const description = localize(video.description, uiLang);

  return (
    <article className="video-card">
      <div className="video-card__media" aria-label={`${title} video`}>
        <video
          key={`${video.id}-${videoLang}`}
          controls
          preload="metadata"
          playsInline
          src={`/videos/${video.id}-${videoLang}.mp4`}
          title={title}
        />
      </div>
      <div className="video-card__body">
        <p className="video-card__duration">Audio available now · Video coming soon</p>
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
          <a
            className="primary"
            href={`/videos/${video.id}-${videoLang}.mp4`}
            download={`resumora-${video.id}-${videoLang}.mp4`}
          >
            {t(uiLang, 'videos.download')}
          </a>
        </div>
      </div>
    </article>
  );
}
