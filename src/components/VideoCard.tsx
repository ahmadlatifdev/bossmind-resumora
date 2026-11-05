import React, { useEffect, useState } from 'react';
import { localize } from '../lib/plans.js';
import { t, LANGS } from '../lib/i18n.js';
import { fetchVideoStreamUrl } from '../lib/videoApi.js';
import { useAuth } from '../auth/AuthContext';

export default function VideoCard({ video, uiLang }) {
  const { subscriptionActive } = useAuth();
  const [videoLang, setVideoLang] = useState(uiLang);
  const [streamUrl, setStreamUrl] = useState('');
  const [streamState, setStreamState] = useState('loading');
  const title = localize(video.title, uiLang);
  const description = localize(video.description, uiLang);
  const downloadName = `resumora-${video.id}-${videoLang}.mp4`;

  useEffect(() => {
    let cancelled = false;
    if (!subscriptionActive) return;
    setStreamUrl('');
    setStreamState('loading');
    fetchVideoStreamUrl({ videoId: video.id, language: videoLang })
      .then((data) => {
        if (cancelled) return;
        if (data.url) {
          setStreamUrl(data.url);
          setStreamState('ready');
        } else {
          setStreamState('error');
        }
      })
      .catch(() => {
        if (!cancelled) setStreamState('error');
      });
    return () => {
      cancelled = true;
    };
  }, [video.id, videoLang, subscriptionActive]);

  if (!subscriptionActive) {
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
              Premium
            </p>
            <p style={{ color: '#fff', marginTop: 4, opacity: 0.9 }}>{title}</p>
          </div>
        </div>
        <div className="video-card__body">
          <h2>{title}</h2>
          <p className="video-card__desc">{description}</p>
          <div className="video-card__actions">
            <a className="primary" href="/pricing">
              Upgrade to Pro to Unlock
            </a>
          </div>
        </div>
      </article>
    );
  }

  return (
    <article className="video-card">
      <div className="video-card__media" aria-label={`${title} video`}>
        {streamUrl ? (
          <video
            key={`${video.id}-${videoLang}`}
            controls
            preload="metadata"
            playsInline
            src={streamUrl}
            title={title}
          />
        ) : (
          <div
            className="video-card__media-placeholder"
            style={{
              alignItems: 'center',
              display: 'flex',
              justifyContent: 'center',
              minHeight: 200,
              opacity: 0.7,
            }}
          >
            {streamState === 'error' ? 'Video unavailable' : 'Loading…'}
          </div>
        )}
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
          {streamUrl ? (
            <a className="primary" href={streamUrl} download={downloadName}>
              {t(uiLang, 'videos.download')}
            </a>
          ) : null}
        </div>
      </div>
    </article>
  );
}
