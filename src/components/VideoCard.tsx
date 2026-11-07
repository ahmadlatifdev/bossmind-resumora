import React, { useEffect, useState } from 'react';
import { localize } from '../lib/plans.js';
import { t, LANGS } from '../lib/i18n.js';
import { fetchVideoStreamUrl, secureAssetUrl, isR2Url } from '../lib/videoApi.js';

export default function VideoCard({ video, uiLang }) {
  const [videoLang, setVideoLang] = useState(uiLang);
  const [streamUrl, setStreamUrl] = useState('');
  const [resolvedR2Url, setResolvedR2Url] = useState('');
  const title = localize(video.title, uiLang);
  const description = localize(video.description, uiLang);
  const downloadName = `resumora-${video.id}-${videoLang}.mp4`;

  // Episode 1 plays the uploaded cinematic master directly from Firebase Storage.
  const EPISODE_1_URL =
    'https://firebasestorage.googleapis.com/v0/b/resumora-live.firebasestorage.app/o/masters%2Finterview-series-v1%2Ffinal_interview.mp4?alt=media';
  const isEpisode1 = video.id === 'vid-resume-to-interview';

  const rawSource = (video.sources && video.sources[videoLang]) || video.url || '';
  const isR2 = isR2Url(rawSource);

  useEffect(() => {
    if (isEpisode1 || isR2) return;
    let cancelled = false;
    setStreamUrl('');
    fetchVideoStreamUrl({ videoId: video.id, language: videoLang })
      .then((data) => {
        if (cancelled) return;
        if (data.url) setStreamUrl(data.url);
      })
      .catch(() => {
        /* leave empty until this episode's master is generated */
      });
    return () => {
      cancelled = true;
    };
  }, [video.id, videoLang, isEpisode1, isR2]);

  useEffect(() => {
    if (!isR2) {
      setResolvedR2Url('');
      return;
    }
    let cancelled = false;
    secureAssetUrl(rawSource)
      .then((url) => {
        if (!cancelled) setResolvedR2Url(url);
      })
      .catch(() => {
        if (!cancelled) setResolvedR2Url('');
      });
    return () => {
      cancelled = true;
    };
  }, [rawSource, isR2]);

  const src = isEpisode1 ? EPISODE_1_URL : isR2 ? resolvedR2Url : streamUrl || '';

  return (
    <article className="video-card">
      <div className="video-card__media" aria-label={`${title} video`}>
        <video
          key={`${video.id}-${videoLang}`}
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
          {src ? (
            <a className="primary" href={src} download={downloadName}>
              {t(uiLang, 'videos.download')}
            </a>
          ) : null}
        </div>
      </div>
    </article>
  );
}
