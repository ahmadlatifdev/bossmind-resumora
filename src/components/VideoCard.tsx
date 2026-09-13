import React, { useState } from 'react';
import { localize } from '../lib/plans.js';
import { t, LANGS } from '../lib/i18n.js';

export default function VideoCard({ video, uiLang }) {
  const [videoLang, setVideoLang] = useState(uiLang);
  const title = localize(video.title, uiLang);
  const description = localize(video.description, uiLang);

  return (
    <article className="video-card">
      <div
        className="video-card__media video-card__media--placeholder"
        aria-label="Video coming soon"
      >
        <div className="video-card__coming-soon">
          <span aria-hidden="true">🎬</span>
          <strong>Video coming soon</strong>
          <span className="muted small">Full 8-minute video in production</span>
        </div>
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
          <a className="primary" href="/interview-series">
            ▶ Listen Now (EN / FR / ES)
          </a>
        </div>
      </div>
    </article>
  );
}
