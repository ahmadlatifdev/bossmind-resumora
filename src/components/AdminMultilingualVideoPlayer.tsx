import { useEffect, useRef, useState } from 'react';

export type VideoLang = 'en' | 'fr' | 'es';

export type VideoUrls = {
  en?: string;
  fr?: string;
  es?: string;
};

type AdminMultilingualVideoPlayerProps = {
  title: string;
  status?: string;
  urls: VideoUrls;
};

const LANGS: VideoLang[] = ['en', 'fr', 'es'];

function resolveUrl(urls: VideoUrls, lang: VideoLang): string {
  const en = String(urls?.en || '').trim();
  const picked = String(urls?.[lang] || '').trim();
  return picked || en;
}

/** Admin Video Asset Manager player — gold EN / FR / ES source switch. */
export default function AdminMultilingualVideoPlayer({
  title,
  status,
  urls,
}: AdminMultilingualVideoPlayerProps) {
  const [lang, setLang] = useState<VideoLang>('en');
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const src = resolveUrl(urls, lang);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    el.load();
  }, [src]);

  return (
    <article className="admin-video-player">
      <header className="admin-video-player__header">
        <h3 className="admin-video-player__title">{title || '—'}</h3>
        {status ? <span className="admin-video-player__status">{status}</span> : null}
      </header>
      <div className="admin-video-player__langs" role="group" aria-label="Video language">
        {LANGS.map((code) => (
          <button
            key={code}
            type="button"
            className={
              lang === code
                ? 'admin-video-player__lang admin-video-player__lang--active'
                : 'admin-video-player__lang'
            }
            aria-pressed={lang === code}
            onClick={() => setLang(code)}
          >
            {code.toUpperCase()}
          </button>
        ))}
      </div>
      {src ? (
        <video
          ref={videoRef}
          className="admin-video-player__video"
          controls
          playsInline
          preload="metadata"
          key={src}
        >
          <source src={src} type="video/mp4" />
        </video>
      ) : (
        <p className="admin-master__lead">No playable URL for this asset.</p>
      )}
    </article>
  );
}
