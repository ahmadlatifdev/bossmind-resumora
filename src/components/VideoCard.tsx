import React, { useEffect, useState } from 'react';
import { localize } from '../lib/plans.js';
import { t, LANGS } from '../lib/i18n.js';
import { fetchVideoStreamUrl } from '../lib/videoApi.js';
import { useAuth } from '../auth/AuthContext';

export default function VideoCard({ video, uiLang }) {
  const { user, subscriptionActive, planId } = useAuth();
  const [videoLang, setVideoLang] = useState(uiLang);
  const [streamUrl, setStreamUrl] = useState('');
  const title = localize(video.title, uiLang);
  const description = localize(video.description, uiLang);
  const downloadName = `resumora-${video.id}-${videoLang}.mp4`;

  // Admin email bypass + any active subscription or "advanced" plan.
  const isAdmin = user?.email?.toLowerCase() === 'ahmadlatifzz20@gmail.com';
  const isUnlocked = isAdmin || subscriptionActive === true || planId === 'advanced';

  // Episode 1 plays the uploaded cinematic master directly from Firebase Storage.
  const EPISODE_1_URL =
    'https://firebasestorage.googleapis.com/v0/b/resumora-live.firebasestorage.app/o/masters%2Finterview-series-v1%2Ffinal_interview.mp4?alt=media';
  const isEpisode1 = video.id === 'vid-resume-to-interview';

  useEffect(() => {
    if (!isUnlocked || isEpisode1) return;
    let cancelled = false;
    setStreamUrl('');
    fetchVideoStreamUrl({ videoId: video.id, language: videoLang })
      .then((data) => {
        if (cancelled) return;
        if (data.url) setStreamUrl(data.url);
      })
      .catch(() => {
        /* fall back to the catalog source below */
      });
    return () => {
      cancelled = true;
    };
  }, [video.id, videoLang, isUnlocked, isEpisode1]);

  const src = isEpisode1
    ? EPISODE_1_URL
    : streamUrl || (video.sources && video.sources[videoLang]) || '';

  if (!isUnlocked) {
    return (
      <article className="video-card">
        <div
          className="video-card__media"
          aria-label={`${title} locked`}
          style={{
            alignItems: 'center',
            background: 'rgba(10, 26, 58, 0.92)',
            display: 'flex',
            justifyContent: 'center',
            minHeight: 200,
          }}
        >
          <div style={{ textAlign: 'center', padding: 16 }}>
            <p
              style={{
                color: 'var(--color-gold)',
                fontWeight: 700,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
              }}
            >
              Enterprise
            </p>
            <p style={{ color: '#fff', marginTop: 4, opacity: 0.9 }}>{title}</p>
          </div>
        </div>
        <div className="video-card__body">
          <h2>{title}</h2>
          <p className="video-card__desc">{description}</p>
          <div className="video-card__actions">
            <a className="primary" href="/pricing">
              Upgrade to Enterprise to access this video
            </a>
          </div>
        </div>
      </article>
    );
  }

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
