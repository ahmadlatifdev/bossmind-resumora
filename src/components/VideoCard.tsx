import React, { useEffect, useState } from 'react';
import { localize } from '../lib/plans.js';
import { t, LANGS } from '../lib/i18n.js';
import { fetchVideoStreamUrl } from '../lib/videoApi.js';

/** Local public fallback path: /videos/{NN}-{slug}-{lang}.mp4 */
function localFilePath(video, lang) {
  const slug = String(video.id || '').replace(/^vid-/, '');
  const num = String(video.order || '').padStart(2, '0');
  return `/videos/${num}-${slug}-${lang}.mp4`;
}

export default function VideoCard({ video, uiLang }) {
  const [videoLang, setVideoLang] = useState(uiLang);
  const [streamUrl, setStreamUrl] = useState('');
  const title = localize(video.title, uiLang);
  const description = localize(video.description, uiLang);

  useEffect(() => {
    let cancelled = false;
    setStreamUrl('');
    fetchVideoStreamUrl({ videoId: video.id, language: videoLang })
      .then((data) => {
        if (!cancelled && data.url) setStreamUrl(data.url);
      })
      .catch(() => {
        /* fall back to local public path */
      });
    return () => {
      cancelled = true;
    };
  }, [video.id, videoLang]);

  const src = streamUrl || localFilePath(video, videoLang);
  const downloadName = `resumora-${video.id}-${videoLang}.mp4`;

  return (
    <article className="video-card">
      <div className="video-card__media" aria-label={`${title} video`}>
        <video
          key={`${video.id}-${videoLang}-${streamUrl || 'local'}`}
          controls
          preload="metadata"
          playsInline
          src={src}
          title={title}
        />
      </div>
      <div className="video-card__body">
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
          <a className="primary" href={src} download={downloadName}>
            {t(uiLang, 'videos.download')}
          </a>
        </div>
      </div>
    </article>
  );
}
